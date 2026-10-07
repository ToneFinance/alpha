/**
 * Cloudflare Worker API endpoint for Tone fund composition
 * Route: /api/v1/tones/:id/composition
 *
 * This endpoint provides the current holdings of a specific Tone (sector token)
 * by calling the Findex GetFundComposition service
 */

import {
  SECTORS,
  callFindex,
  type Env,
  type FundRef,
  type PagesContext,
} from "../../../../lib/findex";

// ============================================================================
// Type Definitions for Findex API
// ============================================================================

interface ProtoDate {
  year: number;
  month: number;
  day: number;
}

interface GetFundCompositionRequest {
  fund_ref: FundRef;
  quote: string;
  as_of?: ProtoDate;
}

// Proto JSON emits enums by name, but some encoders emit the numeric value
type FindexAssetKind =
  | "KIND_UNSPECIFIED"
  | "KIND_CANONICAL"
  | "KIND_BRIDGED"
  | "KIND_WRAPPED"
  | number;

// Proto JSON omits fields holding default values (empty string, 0)
interface FindexAsset {
  chain?: string;
  address?: string;
  decimals?: number;
  kind?: FindexAssetKind;
  relevanceRank?: number;
  relevance_rank?: number;
}

// Proto JSON emits lowerCamelCase by default, but accept original field names too
interface FindexPosition {
  symbol: string;
  weight?: number;
  providerId?: string;
  provider_id?: string;
  providerSpecificSymbol?: string;
  provider_specific_symbol?: string;
  assets?: FindexAsset[];
}

interface GetFundCompositionResponse {
  asOf?: ProtoDate;
  as_of?: ProtoDate;
  lastRebalance?: ProtoDate;
  last_rebalance?: ProtoDate;
  positions?: FindexPosition[];
}

// ============================================================================
// API Response Types
// ============================================================================

type AssetKind = "canonical" | "bridged" | "wrapped";

// A tradable version of a symbol on a chain
interface Asset {
  chain: string; // CAIP-2 chain ID, e.g. "eip155:1"
  address: string | null; // Token contract address, null for the chain's native coin
  decimals: number;
  kind: AssetKind | null; // null if unspecified
  relevanceRank: number; // Lower is more relevant
}

interface Position {
  symbol: string;
  weight: number;
  providerId: string | null; // Price data provider (e.g. COINGECKO), null if unknown
  providerSymbol: string | null; // Symbol at the provider (e.g. "bitcoin"), null if unknown
  assets: Asset[]; // Most relevant first, empty if unknown
}

interface CompositionResponse {
  id: string;
  name: string;
  symbol: string;
  asOf: string | null; // YYYY-MM-DD
  lastRebalance: string | null; // YYYY-MM-DD
  positions: Position[]; // Ordered by weight, largest first
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Parse a YYYY-MM-DD string into a protobuf Date
 */
function toProtoDate(value: string): ProtoDate | null {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    return null;
  }
  const date = {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  };
  // Reject dates that don't exist (e.g. 2026-02-30) rather than letting Findex validation fail
  const parsed = new Date(Date.UTC(date.year, date.month - 1, date.day));
  if (
    date.year < 1 ||
    parsed.getUTCFullYear() !== date.year ||
    parsed.getUTCMonth() !== date.month - 1 ||
    parsed.getUTCDate() !== date.day
  ) {
    return null;
  }
  return date;
}

/**
 * Format a protobuf Date as YYYY-MM-DD
 */
function fromProtoDate(date: ProtoDate | undefined): string | null {
  if (!date || !date.year) {
    return null;
  }
  const pad = (n: number) => String(n ?? 0).padStart(2, "0");
  return `${date.year}-${pad(date.month)}-${pad(date.day)}`;
}

const ASSET_KINDS: Record<string, AssetKind> = {
  KIND_CANONICAL: "canonical",
  "1": "canonical",
  KIND_BRIDGED: "bridged",
  "2": "bridged",
  KIND_WRAPPED: "wrapped",
  "3": "wrapped",
};

/**
 * Map a Findex asset to the API representation
 */
function toAsset(asset: FindexAsset): Asset {
  return {
    chain: asset.chain ?? "",
    address: asset.address || null,
    decimals: asset.decimals ?? 0,
    kind: ASSET_KINDS[String(asset.kind)] ?? null,
    relevanceRank: asset.relevanceRank ?? asset.relevance_rank ?? 0,
  };
}

/**
 * Fetch fund composition from Findex GetFundComposition API
 */
async function fetchFundComposition(
  env: Env,
  fundId: string,
  asOf: ProtoDate | null
): Promise<GetFundCompositionResponse> {
  const request: GetFundCompositionRequest = {
    fund_ref: {
      fund_id: fundId,
    },
    quote: "USD",
  };
  if (asOf) {
    request.as_of = asOf;
  }

  return callFindex<GetFundCompositionRequest, GetFundCompositionResponse>(
    env,
    "GetFundComposition",
    request
  );
}

// ============================================================================
// Request Handler
// ============================================================================

/**
 * Main request handler
 */
export const onRequestGet = async (context: PagesContext) => {
  try {
    // Extract tone ID from the URL params
    const toneId = context.params.id as string;

    if (!toneId) {
      return new Response(JSON.stringify({ error: "Tone ID is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Get sector configuration
    const sector = SECTORS[toneId];
    if (!sector) {
      return new Response(
        JSON.stringify({ error: `Unknown sector: ${toneId}` }),
        {
          status: 404,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // Optional as_of query parameter (defaults to yesterday UTC on the Findex side)
    const url = new URL(context.request.url);
    const asOfParam = url.searchParams.get("as_of");
    const asOf = asOfParam ? toProtoDate(asOfParam) : null;
    if (asOfParam && !asOf) {
      return new Response(
        JSON.stringify({ error: "as_of must be formatted as YYYY-MM-DD" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    const composition = await fetchFundComposition(
      context.env,
      sector.fundId,
      asOf
    );

    const positions = (composition.positions || [])
      .map((p) => ({
        symbol: p.symbol,
        weight: p.weight ?? 0,
        providerId: (p.providerId ?? p.provider_id) || null,
        providerSymbol:
          (p.providerSpecificSymbol ?? p.provider_specific_symbol) || null,
        assets: (p.assets || [])
          .map(toAsset)
          .sort((a, b) => a.relevanceRank - b.relevanceRank),
      }))
      .sort((a, b) => b.weight - a.weight);

    const response: CompositionResponse = {
      id: sector.id,
      name: sector.name,
      symbol: sector.symbol,
      asOf: fromProtoDate(composition.asOf ?? composition.as_of),
      lastRebalance: fromProtoDate(
        composition.lastRebalance ?? composition.last_rebalance
      ),
      positions,
    };

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "public, max-age=43200", // Cache for 12 hours
      },
    });
  } catch (error) {
    console.error("Error in composition endpoint:", error);
    return new Response(
      JSON.stringify({
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
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
