/**
 * Cloudflare Worker API endpoint for Tone chart data
 * Route: /api/v1/tones/:id/chart
 *
 * This endpoint provides historical price data for a specific Tone (sector token)
 * by calling the Findex SimulateFund service
 */

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

interface FundRef {
  fund_id: string;
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

interface AuthTokenResponse {
  access_token: string;
  expires_in?: number;
  token_type?: string;
}

interface Env {
  FINDEX_GATEWAY_URL: string; // Secret configured in Cloudflare Dashboard
  FINDEX_CLIENT_ID: string; // Client ID for authentication
  FINDEX_CLIENT_SECRET: string; // Client secret for authentication
}

type PagesContext = {
  request: Request;
  params: Record<string, string>;
  env: Env;
  waitUntil: (promise: Promise<unknown>) => void;
};

// ============================================================================
// Sector Configuration
// ============================================================================

interface SectorConfig {
  id: string;
  name: string;
  symbol: string;
  fundId: string; // Fund ID used in Findex API
}

const SECTORS: Record<string, SectorConfig> = {
  ai: {
    id: "ai",
    name: "AI Sector",
    symbol: "tAI",
    fundId: "01KD0FM283Q99445PG1438K59P",
  },
  usa: {
    id: "usa",
    name: "Made in America",
    symbol: "tUSA",
    fundId: "01KD0FNAM0WE7C80TDFRMEQ0BX",
  },
};

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
 * Calculate date range based on timeframe
 */
function getDateRange(timeframe: string): { from: Date; to: Date } {
  const to = new Date();
  const from = new Date();

  switch (timeframe) {
    case "7d":
      from.setDate(from.getDate() - 7);
      break;
    case "90d":
      from.setDate(from.getDate() - 90);
      break;
    case "30d":
    default:
      from.setDate(from.getDate() - 30);
      break;
  }

  return { from, to };
}

/**
 * Simple in-memory token cache for worker instance
 * Note: This cache is per-worker instance and will be lost on worker restart
 */
let cachedToken: { token: string; expiresAt: number } | null = null;

/**
 * Fetch authentication token from Findex auth endpoint
 */
async function fetchAuthToken(
  gatewayUrl: string,
  clientId: string,
  clientSecret: string
): Promise<string> {
  // Check in-memory cache first
  if (cachedToken && cachedToken.expiresAt > Date.now()) {
    return cachedToken.token;
  }

  const url = `${gatewayUrl}/auth/token`;

  // Prepare Basic Auth header
  const basicAuth = btoa(`${clientId}:${clientSecret}`);

  // Prepare form data for OAuth2 client_credentials grant
  const formData = new URLSearchParams();
  formData.append("grant_type", "client_credentials");

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Authorization": `Basic ${basicAuth}`,
    },
    body: formData.toString(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Auth error: ${response.status} ${response.statusText} - ${errorText}`
    );
  }

  const data: AuthTokenResponse = await response.json();

  // Cache the token (default to 55 minutes if expires_in not provided)
  const expiresIn = data.expires_in || 3300; // 55 minutes in seconds
  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + (expiresIn - 60) * 1000, // Expire 1 minute early for safety
  };

  return data.access_token;
}

/**
 * Fetch chart data from Findex SimulateFund API
 */
async function fetchFindexData(
  gatewayUrl: string,
  clientId: string,
  clientSecret: string,
  fundId: string,
  from: Date,
  to: Date
): Promise<PricePoint[]> {
  // Get authentication token
  const token = await fetchAuthToken(gatewayUrl, clientId, clientSecret);

  const request: SimulateFundRequest = {
    quote: "USD",
    from: from.toISOString(),
    to: to.toISOString(),
    fund_ref: {
      fund_id: fundId,
    },
  };

  const url = `${gatewayUrl}/srvc.findex.v1.FindexService/SimulateFund`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    throw new Error(
      `Findex API error: ${response.status} ${response.statusText}`
    );
  }

  const data: SimulateFundResponse = await response.json();
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

    const gatewayUrl = context.env.FINDEX_GATEWAY_URL;
    const clientId = context.env.FINDEX_CLIENT_ID;
    const clientSecret = context.env.FINDEX_CLIENT_SECRET;

    const pricePoints = await fetchFindexData(
      gatewayUrl,
      clientId,
      clientSecret,
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
