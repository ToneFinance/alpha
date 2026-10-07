/**
 * Cloudflare Worker for Tone Finance Alpha
 * Handles API routes and serves static Next.js assets
 */

import { onRequestGet as handleChartGet, onRequestOptions as handleChartOptions } from './api/v1/tones/[id]/chart';
import { onRequestGet as handleCompositionGet, onRequestOptions as handleCompositionOptions } from './api/v1/tones/[id]/composition';

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // Handle API routes for chart data
    // Pattern: /api/v1/tones/:id/chart
    const chartMatch = url.pathname.match(/^\/api\/v1\/tones\/([^/]+)\/chart$/);

    if (chartMatch) {
      const toneId = chartMatch[1];

      // Create context object for the chart handler
      const context = {
        request,
        params: { id: toneId },
        env,
        waitUntil: ctx.waitUntil.bind(ctx),
      };

      // Handle different HTTP methods
      if (request.method === 'GET') {
        return handleChartGet(context);
      } else if (request.method === 'OPTIONS') {
        return handleChartOptions();
      }

      // Method not allowed
      return new Response('Method Not Allowed', {
        status: 405,
        headers: { 'Content-Type': 'text/plain' },
      });
    }

    // Handle API routes for fund composition
    // Pattern: /api/v1/tones/:id/composition
    const compositionMatch = url.pathname.match(/^\/api\/v1\/tones\/([^/]+)\/composition$/);

    if (compositionMatch) {
      const context = {
        request,
        params: { id: compositionMatch[1] },
        env,
        waitUntil: ctx.waitUntil.bind(ctx),
      };

      if (request.method === 'GET') {
        return handleCompositionGet(context);
      } else if (request.method === 'OPTIONS') {
        return handleCompositionOptions();
      }

      return new Response('Method Not Allowed', {
        status: 405,
        headers: { 'Content-Type': 'text/plain' },
      });
    }

    // For all other routes, serve static assets
    // The ASSETS binding automatically serves files from the /out directory
    return env.ASSETS.fetch(request);
  },
};
