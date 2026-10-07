/**
 * Cloudflare Worker API endpoint for Tone chart data
 * Route: /api/v1/tones/:id/chart
 *
 * This endpoint provides historical price data for a specific Tone (sector token)
 * by calling the Findex SimulateFund service
 */

import { getDateRange } from "@/lib/time";
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

interface PricePoint {
  timestamp: string;
  price: number;
}

interface SimulateFundRequest {
  quote: string;
  from: string;
  to: string;
  fund_ref: FundRef;
}

interface SimulateFundResponse {
  data: PricePoint[];
}

// ============================================================================
// API Response Types
// ============================================================================

interface ChartDataPoint {
  timestamp: number;
  price: number;
}

interface ChartResponse {
  id: string;
  name: string;
  symbol: string;
  data: ChartDataPoint[];
  timeframe: string;
  lastUpdated: string;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Convert protobuf Timestamp to milliseconds
 */
function fromProtoTimestamp(timestamp: string): Date {
  return new Date(timestamp);
}

/**
 * Fetch chart data from Findex SimulateFund API
 */
async function fetchFindexData(
  env: Env,
  fundId: string,
  from: Date,
  to: Date
): Promise<PricePoint[]> {
  const request: SimulateFundRequest = {
    quote: "USD",
    from: "2024-01-01T00:00:00Z",
    to: to.toISOString(),
    fund_ref: {
      fund_id: fundId,
    },
  };

  const data = await callFindex<SimulateFundRequest, SimulateFundResponse>(
    env,
    "SimulateFund",
    request
  );
  return data.data || [];
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

    // Get query parameters
    const url = new URL(context.request.url);
    const timeframe = url.searchParams.get("timeframe") || "30d";
    const { from, to } = getDateRange(timeframe);

    let chartData: ChartDataPoint[];

    const pricePoints = await fetchFindexData(
      context.env,
      sector.fundId,
      from,
      to
    );

    // Convert to chart data format
    chartData = pricePoints.map((point) => ({
      timestamp: fromProtoTimestamp(point.timestamp).getTime(),
      price: point.price,
    }));

    // Sort by timestamp
    chartData.sort((a, b) => a.timestamp - b.timestamp);

    const response: ChartResponse = {
      id: sector.id,
      name: sector.name,
      symbol: sector.symbol,
      data: chartData,
      timeframe,
      lastUpdated: new Date().toISOString(),
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
    console.error("Error in chart endpoint:", error);
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
