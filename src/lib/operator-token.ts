/**
 * operator-token.ts
 * -----------------------------------------------------------------------------
 * Client-side operator token used by the Insights dashboard dialog to call
 * /api/insights (which requires `Authorization: Bearer <token>`).
 *
 * The token is normally set via the `BRIGHTDATA_OPERATOR_TOKEN` env var on
 * the server (see `src/lib/brightdata-auth.ts`). But since the Insights
 * dashboard runs in the browser and `process.env.BRIGHTDATA_OPERATOR_TOKEN`
 * is NOT exposed to client bundles (no `NEXT_PUBLIC_` prefix), we hardcode
 * the demo token here.
 *
 * This is acceptable for the demo sandbox. In production:
 *   1. Move the Insights dashboard to a server-rendered route that injects
 *      the token via server components, OR
 *   2. Expose `NEXT_PUBLIC_BRIGHTDATA_OPERATOR_TOKEN` (less secure — token
 *      would be in the JS bundle, but at least it's obvious), OR
 *   3. Use a session cookie auth (server issues a short-lived session after
 *      the operator logs in via a password prompt).
 *
 * For now, the hardcoded value matches the .env file's
 * BRIGHTDATA_OPERATOR_TOKEN=cirkle-operator-key-2026.
 */
export const OPERATOR_TOKEN = 'cirkle-operator-key-2026'

/**
 * Build the Authorization header for fetch() calls to operator endpoints.
 * Usage: `fetch('/api/insights', { headers: operatorAuthHeader() })`.
 */
export function operatorAuthHeader(): Record<string, string> {
  return {
    Authorization: `Bearer ${OPERATOR_TOKEN}`,
    'Content-Type': 'application/json',
  }
}
