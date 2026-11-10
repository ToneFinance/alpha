/**
 * Cloudflare Worker API endpoint for a wallet's Tone purchases
 * Route: GET /api/v1/wallets/:address/transactions
 *
 * Lists the confirmed purchases of a wallet, newest first, by calling the
 * Findex ListWalletTransactions service
 */

import { FindexError, callFindex, type PagesContext } from "../../../../lib/findex";
import {
  ADDRESS_PATTERN,
  SUPPORTED_CHAINS,
  jsonResponse,
  toWalletTransaction,
  type FindexWalletTransaction,
  type WalletTransaction,
} from "../../../../lib/wallet-transactions";

// ============================================================================
// Type Definitions for Findex API
// ============================================================================

interface ListWalletTransactionsRequest {
  wallet: string;
  chain?: string;
  pageSize?: number;
  pageToken?: string;
}

interface ListWalletTransactionsResponse {
  transactions?: FindexWalletTransaction[];
  nextPageToken?: string;
}

// ============================================================================
// API Response Types
// ============================================================================

interface ListResponse {
  wallet: string;
  transactions: WalletTransaction[]; // Confirmed purchases, newest first
  nextPageToken: string | null; // null on the last page
}

const MAX_PAGE_SIZE = 1000;

// ============================================================================
// Request Handler
// ============================================================================

/**
 * Main request handler
 */
export const onRequestGet = async (context: PagesContext) => {
  try {
    const wallet = context.params.address as string;
    if (!wallet || !ADDRESS_PATTERN.test(wallet)) {
      return jsonResponse(
        { error: "Wallet address must be 0x followed by 40 hex digits" },
        400
      );
    }

    const url = new URL(context.request.url);
    const request: ListWalletTransactionsRequest = { wallet };

    // Optional chain filter (all supported chains if omitted)
    const chain = url.searchParams.get("chain");
    if (chain) {
      if (!SUPPORTED_CHAINS.includes(chain)) {
        return jsonResponse(
          { error: `chain must be one of: ${SUPPORTED_CHAINS.join(", ")}` },
          400
        );
      }
      request.chain = chain;
    }

    // Optional page size (Findex defaults to 100)
    const pageSizeParam = url.searchParams.get("page_size");
    if (pageSizeParam) {
      const pageSize = Number(pageSizeParam);
      if (!Number.isInteger(pageSize) || pageSize < 0 || pageSize > MAX_PAGE_SIZE) {
        return jsonResponse(
          { error: `page_size must be an integer between 0 and ${MAX_PAGE_SIZE}` },
          400
        );
      }
      request.pageSize = pageSize;
    }

    // Page token keeps the chain and page size of the first request
    const pageToken = url.searchParams.get("page_token");
    if (pageToken) {
      request.pageToken = pageToken;
    }

    const result = await callFindex<
      ListWalletTransactionsRequest,
      ListWalletTransactionsResponse
    >(context.env, "ListWalletTransactions", request);

    const response: ListResponse = {
      wallet: wallet.toLowerCase(),
      transactions: (result.transactions ?? []).map(toWalletTransaction),
      nextPageToken: result.nextPageToken || null,
    };

    return jsonResponse(response, 200, "public, max-age=60"); // Cache for 1 minute
  } catch (error) {
    if (error instanceof FindexError && error.code === "invalid_argument") {
      return jsonResponse({ error: error.detail || "Invalid request" }, 400);
    }
    console.error("Error in wallet transactions endpoint:", error);
    return jsonResponse(
      {
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      500
    );
  }
};

/**
 * Handle OPTIONS requests for CORS preflight
 */
export const onRequestOptions = async () => {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400",
    },
  });
};
