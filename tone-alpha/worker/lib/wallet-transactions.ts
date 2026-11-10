/**
 * Shared types and mapping for Findex wallet transactions
 * (ReportWalletTransactions / ListWalletTransactions)
 */

import { SECTORS } from "./findex";

// ============================================================================
// Type Definitions for Findex API
// ============================================================================

// Proto JSON omits fields holding default values (empty string, empty list)
export interface FindexTransfer {
  token?: string;
  direction?: "DIRECTION_IN" | "DIRECTION_OUT" | "DIRECTION_UNSPECIFIED";
  amount?: string;
  counterparty?: string;
}

export interface FindexWalletTransaction {
  chain?: string;
  wallet?: string;
  txHash?: string;
  status?: "STATUS_PENDING" | "STATUS_CONFIRMED" | "STATUS_UNSPECIFIED";
  fundIds?: string[];
  blockNumber?: string;
  blockTime?: string;
  reportedAt?: string;
  transfers?: FindexTransfer[];
}

// ============================================================================
// API Response Types
// ============================================================================

interface Transfer {
  token: string | null; // ERC-20 contract address, null for the native coin
  direction: "in" | "out" | null; // Seen from the wallet
  amount: string; // Token base units, decimal string
  counterparty: string;
}

export interface WalletTransaction {
  chain: string; // CAIP-2 chain ID
  wallet: string | null; // Buyer, null while pending
  txHash: string;
  status: "pending" | "confirmed" | null;
  fundIds: string[]; // Findex fund ULIDs the purchase was attributed to
  toneIds: string[]; // Tone (sector) IDs for the fundIds we know about
  blockNumber: number | null;
  blockTime: string | null; // RFC 3339, null while pending
  reportedAt: string | null; // RFC 3339
  transfers: Transfer[];
}

// ============================================================================
// Validation
// ============================================================================

export const SUPPORTED_CHAINS = ["eip155:1", "eip155:8453"];

export const TX_HASH_PATTERN = /^0x[0-9a-fA-F]{64}$/;
export const ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/;

// ============================================================================
// Mapping
// ============================================================================

const TONE_IDS_BY_FUND_ID: Record<string, string> = Object.fromEntries(
  Object.values(SECTORS).map((sector) => [sector.fundId, sector.id])
);

const STATUSES: Record<string, WalletTransaction["status"]> = {
  STATUS_PENDING: "pending",
  STATUS_CONFIRMED: "confirmed",
};

const DIRECTIONS: Record<string, Transfer["direction"]> = {
  DIRECTION_IN: "in",
  DIRECTION_OUT: "out",
};

/**
 * Map a Findex wallet transaction to the API representation
 */
export function toWalletTransaction(
  tx: FindexWalletTransaction
): WalletTransaction {
  const fundIds = tx.fundIds ?? [];
  return {
    chain: tx.chain ?? "",
    wallet: tx.wallet || null,
    txHash: tx.txHash ?? "",
    status: STATUSES[tx.status ?? ""] ?? null,
    fundIds,
    toneIds: fundIds
      .map((fundId) => TONE_IDS_BY_FUND_ID[fundId])
      .filter((id): id is string => Boolean(id)),
    blockNumber: tx.blockNumber ? Number(tx.blockNumber) : null,
    blockTime: tx.blockTime || null,
    reportedAt: tx.reportedAt || null,
    transfers: (tx.transfers ?? []).map((t) => ({
      token: t.token || null,
      direction: DIRECTIONS[t.direction ?? ""] ?? null,
      amount: t.amount || "0",
      counterparty: t.counterparty ?? "",
    })),
  };
}

/**
 * Build a JSON response with CORS headers
 */
export function jsonResponse(
  body: unknown,
  status: number,
  cacheControl = "no-store"
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": cacheControl,
    },
  });
}
