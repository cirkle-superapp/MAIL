/**
 * operator-token.ts
 * -----------------------------------------------------------------------------
 * Client-side operator token used by the Insights dashboard dialog to call
 * /api/insights (which requires `Authorization: Bearer <token>`).
 *
 * HARDENING (Task 81): the token is now read from a NEXT_PUBLIC env var, NOT
 * hardcoded. The `NEXT_PUBLIC_OPERATOR_TOKEN` env var must be set in .env
 * (or .env.local) to the SAME value as the server's BRIGHTDATA_OPERATOR_TOKEN
 * env var. If unset, the Insights dashboard will show "Unauthorized" — which
 * is the secure default (no open dashboard in production).
 *
 * For local development:
 *   1. Add `NEXT_PUBLIC_OPERATOR_TOKEN=cirkle-operator-key-2026` to .env
 *   2. Restart the dev server
 *   3. The Insights dashboard will then work locally
 *
 * For production:
 *   - Don't expose operator endpoints to the public internet at all. Move
 *     the dashboard to an authenticated admin route (server-rendered, with
 *     session-cookie auth + role-based access control).
 *   - The token in NEXT_PUBLIC_* is bundled into client JS — anyone with
 *     DevTools can see it. Use it only for low-stakes demo environments.
 */

/** The operator token (read from NEXT_PUBLIC env var — empty if unset). */
export const OPERATOR_TOKEN: string =
  process.env.NEXT_PUBLIC_OPERATOR_TOKEN || ''

/**
 * Build the Authorization header for fetch() calls to operator endpoints.
 * Returns empty headers (no Authorization) when the token is unset — the
 * server will then return 401/403, and the UI shows "Unauthorized".
 */
export function operatorAuthHeader(): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  if (OPERATOR_TOKEN) {
    headers['Authorization'] = `Bearer ${OPERATOR_TOKEN}`
  }
  return headers
}
