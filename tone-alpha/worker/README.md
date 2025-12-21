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
