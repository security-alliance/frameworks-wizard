// Tiny HTTP helpers shared by the auth endpoints.

import type { Env } from './env.js'

export function json(
  body: unknown,
  status = 200,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  })
}

// Env vars the auth backend needs. Returns a comma-joined list of any that are
// missing (so a misconfigured deploy fails loudly instead of half-working),
// or null when all present.
export function missingEnv(env: Env): string | null {
  const need = ['GITHUB_CLIENT_ID', 'GITHUB_CLIENT_SECRET', 'SESSION_SECRET'] as const
  const missing = need.filter((k) => !env[k])
  return missing.length ? missing.join(', ') : null
}
