/**
 * Shared Findex gateway client: authentication, sector config and RPC calls
 */

// ============================================================================
// Type Definitions
// ============================================================================

export interface Env {
  FINDEX_GATEWAY_URL: string; // Secret configured in Cloudflare Dashboard
  FINDEX_CLIENT_ID: string; // Client ID for authentication
  FINDEX_CLIENT_SECRET: string; // Client secret for authentication
}

export type PagesContext = {
  request: Request;
  params: Record<string, string>;
  env: Env;
  waitUntil: (promise: Promise<unknown>) => void;
};

export interface FundRef {
  fund_id: string;
}

interface AuthTokenResponse {
  access_token: string;
  expires_in?: number;
  token_type?: string;
}

// ============================================================================
// Sector Configuration
// ============================================================================

export interface SectorConfig {
  id: string;
  name: string;
  symbol: string;
  fundId: string; // Fund ID used in Findex API
}

export const SECTORS: Record<string, SectorConfig> = {
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
  rwa: {
    id: "rwa",
    name: "RWA",
    symbol: "tRWA",
    fundId: "01KD0FHT61EDQ1MM536X4XWCXN",
  },
  privacy: {
    id: "privacy",
    name: "Privacy",
    symbol: "tPRV",
    fundId: "01M3S8DA23VMF97XDRAHVX5RQ6",
  },
  payment: {
    id: "payment",
    name: "Payment ISO 20022",
    symbol: "tISO",
    fundId: "01M3S8RJMJ24KJXFZYKK25D9P4",
  },
};

// ============================================================================
// Authentication
// ============================================================================

/**
 * Simple in-memory token cache for worker instance
 * Note: This cache is per-worker instance and will be lost on worker restart
 */
let cachedToken: { token: string; expiresAt: number } | null = null;

/**
 * Fetch authentication token from Findex auth endpoint
 */
export async function fetchAuthToken(
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

// ============================================================================
// RPC
// ============================================================================

/**
 * Call a FindexService RPC method with an authenticated JSON request
 */
export async function callFindex<Req, Res>(
  env: Env,
  method: string,
  request: Req
): Promise<Res> {
  const token = await fetchAuthToken(
    env.FINDEX_GATEWAY_URL,
    env.FINDEX_CLIENT_ID,
    env.FINDEX_CLIENT_SECRET
  );

  const url = `${env.FINDEX_GATEWAY_URL}/srvc.findex.v1.FindexService/${method}`;

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

  return response.json();
}
