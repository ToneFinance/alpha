# Cloudflare Worker API Functions

This directory contains Cloudflare Pages Functions that provide API endpoints for the Tone Finance application.

## API Endpoints

### GET `/api/v1/tones/:id/chart`

Fetches historical price data for a specific Tone (sector token).

**Parameters:**
- `id` (path parameter): The sector identifier (`ai` or `usa`)
- `timeframe` (query parameter, optional): Time range for the data
  - `7d` - 7 days
  - `30d` - 30 days (default)
  - `90d` - 90 days

**Example Requests:**
```bash
# Get 30-day chart for AI sector
curl https://alpha.lab.tone.finance/api/v1/tones/ai/chart

# Get 7-day chart for USA sector
curl https://alpha.lab.tone.finance/api/v1/tones/usa/chart?timeframe=7d
```

**Response Format:**
```json
{
  "id": "ai",
  "name": "AI Sector",
  "symbol": "tAI",
  "fundId": "01KD0FM283Q99445PG1438K59P",
  "data": [
    {
      "timestamp": 1734784800000,
      "price": 1.234567
    }
  ],
  "timeframe": "30d",
  "lastUpdated": "2025-12-21T12:00:00.000Z"
}
```

### GET `/api/v1/tones/:id/composition`

Fetches the current holdings of a specific Tone (sector token) via Findex `GetFundComposition`.

**Parameters:**
- `id` (path parameter): The sector identifier (e.g. `ai`, `usa`)
- `as_of` (query parameter, optional): Date to report the composition for, as `YYYY-MM-DD`. Defaults to yesterday (UTC), the latest day with complete prices.

**Example Requests:**
```bash
curl https://alpha.lab.tone.finance/api/v1/tones/ai/composition
curl https://alpha.lab.tone.finance/api/v1/tones/ai/composition?as_of=2026-09-30
```

**Response Format:**
```json
{
  "id": "ai",
  "name": "AI Sector",
  "symbol": "tAI",
  "fundId": "01KD0FM283Q99445PG1438K59P",
  "asOf": "2026-10-06",
  "lastRebalance": "2026-09-01",
  "positions": [
    {
      "symbol": "BTC",
      "weight": 0.42,
      "providerId": "COINGECKO",
      "providerSymbol": "bitcoin",
      "assets": [
        { "chain": "eip155:1", "address": "0x2260fac5e5542a773aa44fbcfedf7c193bc2c599", "decimals": 8, "kind": "wrapped", "relevanceRank": 1 }
      ]
    },
    {
      "symbol": "ETH",
      "weight": 0.31,
      "providerId": "COINGECKO",
      "providerSymbol": "ethereum",
      "assets": [
        { "chain": "eip155:1", "address": null, "decimals": 18, "kind": "canonical", "relevanceRank": 0 },
        { "chain": "eip155:1", "address": "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2", "decimals": 18, "kind": "wrapped", "relevanceRank": 1 }
      ]
    }
  ]
}
```

`fundId` is the Findex fund ULID backing the Tone (also returned by the chart endpoint).

Positions are ordered by weight (largest first) and weights sum to 1. `providerId` is the price data provider for the symbol (e.g. `COINGECKO`, `COINCODEX`) and `providerSymbol` identifies the asset at that provider; both are `null` if unknown.

`assets` lists the tradable versions of the symbol, most relevant first (lowest `relevanceRank`), and is empty if unknown. `chain` is a CAIP-2 chain ID (e.g. `eip155:1`), `address` is the token contract (`null` for the chain's native coin), and `kind` is one of `canonical`, `bridged`, `wrapped`, or `null` if unspecified.

### POST `/api/v1/transactions`

Reports on-chain Tone purchases via Findex `ReportWalletTransactions` and returns their current status. Only transaction hashes are reported; buyer, funds and transfers are read from the chain once the transaction's block is finalized.

Idempotent: reporting the same hashes again is safe and returns their current status. Transactions that are not fund purchases (reverted, without an ERC-8021 attribution code, or not mined within 24 hours) are discarded and drop out of the response; they can be reported again.

**Body:**
- `chain`: CAIP-2 chain ID, `eip155:1` (Ethereum) or `eip155:8453` (Base)
- `txHashes`: 1–50 hashes, each `0x` followed by 64 hex digits

**Example Request:**
```bash
curl -X POST https://alpha.lab.tone.finance/api/v1/transactions \
  -H 'Content-Type: application/json' \
  -d '{"chain": "eip155:8453", "txHashes": ["0x5f2c…"]}'
```

**Response Format:**
```json
{
  "transactions": [
    {
      "chain": "eip155:8453",
      "wallet": "0x1111111111111111111111111111111111111111",
      "txHash": "0x5f2c…",
      "status": "confirmed",
      "fundIds": ["01KD0FM283Q99445PG1438K59P"],
      "toneIds": ["ai"],
      "blockNumber": 21234567,
      "blockTime": "2026-11-10T09:12:31Z",
      "reportedAt": "2026-11-10T09:12:35Z",
      "transfers": [
        { "token": "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913", "direction": "out", "amount": "100000000", "counterparty": "0x…" }
      ]
    }
  ]
}
```

Transactions are in request order. A pending hash appears once with `status: "pending"` and `wallet`/`blockTime` set to `null`. A confirmed hash appears once per buyer: an ERC-4337 bundle can hold purchases by several smart accounts.

### GET `/api/v1/wallets/:address/transactions`

Lists the confirmed Tone purchases of a wallet, newest first, via Findex `ListWalletTransactions`. Pending transactions are not listed, as their buyer is only known once they are confirmed.

**Parameters:**
- `address` (path parameter): EVM address (`0x` followed by 40 hex digits)
- `chain` (query parameter, optional): `eip155:1` or `eip155:8453`. Omit to list all supported chains.
- `page_size` (query parameter, optional): 0–1000, defaults to 100
- `page_token` (query parameter, optional): `nextPageToken` of the previous response. Keeps the `chain` and `page_size` of the first request.

**Example Requests:**
```bash
curl https://alpha.lab.tone.finance/api/v1/wallets/0x1111111111111111111111111111111111111111/transactions
curl "https://alpha.lab.tone.finance/api/v1/wallets/0x1111111111111111111111111111111111111111/transactions?chain=eip155:8453&page_size=20"
```

**Response Format:**
```json
{
  "wallet": "0x1111111111111111111111111111111111111111",
  "transactions": [ /* same shape as above, status always "confirmed" */ ],
  "nextPageToken": "CgwI…"
}
```

`nextPageToken` is `null` on the last page. A page can hold fewer than `page_size` transactions, or none, while more follow: keep paging until `nextPageToken` is `null`, not until a page comes back empty.

**Transaction fields:** `fundIds` are the Findex fund ULIDs the purchase was attributed to and `toneIds` the matching Tone IDs (unknown funds are left out). `transfers` are ERC-20 and native transfers to and from the wallet; `token` is `null` for the native coin, `direction` is `in` or `out` seen from the wallet, and `amount` is in the token's base units as a decimal string. Native coin moved by internal calls (e.g. inside batches) is not included. Addresses and hashes are always lower-case.

Invalid input (and an invalid `page_token`) returns `400` with an `error` message.

## Configuration

### Environment Variables / Secrets

The API requires the following secrets to be configured in the Cloudflare Dashboard:

**`FINDEX_GATEWAY_URL`** (Secret)
- The base URL for the Findex API gateway
- Example: `https://gateway.findex.tone.finance`
- **Important**: This should be configured as a secret in Cloudflare, not in `wrangler.toml`

**`FINDEX_CLIENT_ID`** (Secret)
- The client ID for Findex API authentication
- Used to obtain bearer tokens from the `/auth/token` endpoint

**`FINDEX_CLIENT_SECRET`** (Secret)
- The client secret for Findex API authentication
- Used together with client ID to obtain bearer tokens

#### How to Configure Secrets in Cloudflare:

1. **Via Cloudflare Dashboard:**
   - Go to your Cloudflare Pages project
   - Navigate to Settings → Environment Variables
   - Add the following variables (mark each as "Secret"):
     - Name: `FINDEX_GATEWAY_URL`, Value: Your gateway URL
     - Name: `FINDEX_CLIENT_ID`, Value: Your client ID
     - Name: `FINDEX_CLIENT_SECRET`, Value: Your client secret
   - Environment: Production (and/or Preview)

2. **Via Wrangler CLI:**
   ```bash
   # For production
   wrangler pages secret put FINDEX_GATEWAY_URL --project-name=finance-tone-lab-alpha
   wrangler pages secret put FINDEX_CLIENT_ID --project-name=finance-tone-lab-alpha
   wrangler pages secret put FINDEX_CLIENT_SECRET --project-name=finance-tone-lab-alpha

   # For preview deployments (add --env=preview to each command)
   ```

### Local Development

For local development without the Findex credentials configured:
- The API will automatically fall back to generating mock data
- You'll see a warning in the console: `Findex credentials not fully configured, using mock data`

To test with the real Findex API locally:
1. Create a `.dev.vars` file in the project root (it's gitignored)
2. Add the following:
   ```
   FINDEX_GATEWAY_URL=https://your-gateway-url
   FINDEX_CLIENT_ID=your-client-id
   FINDEX_CLIENT_SECRET=your-client-secret
   ```

## Integration Details

### Findex API

The chart endpoint integrates with the Findex backend service with the following flow:

#### 1. Authentication
**Endpoint:** `POST {{gateway}}/auth/token`

**Authorization:** Basic Auth (client_id:client_secret)

**Content-Type:** `application/x-www-form-urlencoded`

**Request Body (form data):**
```
grant_type=client_credentials
```

**Example:**
```bash
curl -X POST {{gateway}}/auth/token \
  -H "Authorization: Basic $(echo -n 'client_id:client_secret' | base64)" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=client_credentials"
```

**Response:**
```json
{
  "access_token": "eyJ...",
  "expires_in": 3600,
  "token_type": "Bearer"
}
```

**Token Caching:**
- Tokens are cached in-memory for the lifetime of the worker instance
- Automatically refreshed 1 minute before expiration
- Cache is per-worker instance (lost on worker restart)

#### 2. SimulateFund Service
**Endpoint:** `POST {{gateway}}/srvc.findex.v1.FindexService/SimulateFund`

**Authentication:** Bearer token (obtained from `/auth/token`)

**Request:**
```json
{
  "quote": "USD",
  "from": { "seconds": "1734700000", "nanos": 0 },
  "to": { "seconds": "1734800000", "nanos": 0 },
  "fund_ref": {
    "fund_id": "01KD0FM283Q99445PG1438K59P"
  },
  "response_detail": 1,
  "flags": [1]
}
```

**Response:**
```json
{
  "data": [
    {
      "timestamp": { "seconds": "1734700000", "nanos": 0 },
      "price": 1.234567
    }
  ]
}
```

**Sector to Fund ID Mapping:**
- AI Sector (`ai`): `01KD0FM283Q99445PG1438K59P`
- Made in America (`usa`): `01KD0FNAM0WE7C80TDFRMEQ0BX`

## Error Handling

The API includes comprehensive error handling:

1. **Invalid Sector ID**: Returns 404 with error message
2. **Authentication Errors**: Falls back to mock data and logs error
3. **Findex API Errors**: Falls back to mock data and logs error
4. **Missing Credentials**: Uses mock data for development
5. **Network Errors**: Returns 500 with error details

## CORS

CORS is configured to allow all origins (`*`). Adjust in the endpoint code if you need to restrict access.

## Caching

Responses are cached for 5 minutes (`Cache-Control: public, max-age=300`) to reduce API calls and improve performance.

## Deployment

To deploy the updated functions:

```bash
# Build the Next.js application
npm run build

# Deploy to Cloudflare Pages
wrangler pages deploy out
```

The `/functions` directory is automatically detected and deployed alongside your static assets.
