/**
 * Cloudflare Worker API endpoint for reporting on-chain Tone purchases
 * Route: POST /api/v1/transactions
 *
 * Reports transaction hashes to the Findex ReportWalletTransactions service
 * and returns their current status. Idempotent: reporting the same hashes
 * again is safe.
 */

import { FindexError, callFindex, type PagesContext } from "../../lib/findex";
import {
  SUPPORTED_CHAINS,
  TX_HASH_PATTERN,
  jsonResponse,
  toWalletTransaction,
  type FindexWalletTransaction,
  type WalletTransaction,
} from "../../lib/wallet-transactions";

// ============================================================================
// Type Definitions for Findex API
// ============================================================================

interface ReportWalletTransactionsRequest {
  chain: string;
  txHashes: string[];
}

interface ReportWalletTransactionsResponse {
  transactions?: FindexWalletTransaction[];
}

// ============================================================================
// API Response Types
// ============================================================================

interface ReportResponse {
  // In request order: pending hashes appear once, confirmed hashes once per buyer
  transactions: WalletTransaction[];
}

const MAX_TX_HASHES = 50;

// ============================================================================
// Request Handler
// ============================================================================

/**
 * Main request handler
 */
export const onRequestPost = async (context: PagesContext) => {
  try {
    let body: { chain?: unknown; txHashes?: unknown };
    try {
      body = await context.request.json();
    } catch {
      return jsonResponse({ error: "Request body must be JSON" }, 400);
    }

    const { chain, txHashes } = body ?? {};

    if (typeof chain !== "string" || !SUPPORTED_CHAINS.includes(chain)) {
      return jsonResponse(
        { error: `chain must be one of: ${SUPPORTED_CHAINS.join(", ")}` },
        400
      );
    }

    if (
      !Array.isArray(txHashes) ||
      txHashes.length < 1 ||
      txHashes.length > MAX_TX_HASHES ||
      !txHashes.every((h) => typeof h === "string" && TX_HASH_PATTERN.test(h))
    ) {
      return jsonResponse(
        {
          error: `txHashes must hold 1-${MAX_TX_HASHES} hashes, each 0x followed by 64 hex digits`,
        },
        400
      );
    }

    const result = await callFindex<
      ReportWalletTransactionsRequest,
      ReportWalletTransactionsResponse
    >(context.env, "ReportWalletTransactions", { chain, txHashes });

    const response: ReportResponse = {
      transactions: (result.transactions ?? []).map(toWalletTransaction),
    };

    return jsonResponse(response, 200);
  } catch (error) {
    if (error instanceof FindexError && error.code === "invalid_argument") {
      return jsonResponse({ error: error.detail || "Invalid request" }, 400);
    }
    console.error("Error in transactions endpoint:", error);
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
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400",
    },
  });
};
