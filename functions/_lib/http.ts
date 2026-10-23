// Tiny HTTP helpers shared by the endpoints.

import { GitHubError } from './github.js'
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

// For answers about the signed-in person. `no-store` keeps them out of every
// cache between here and the browser, so the next visitor on a shared machine —
// or behind a shared proxy — can't be handed the last one's.
export const PRIVATE = { 'Cache-Control': 'no-store, private', Vary: 'Cookie' }

// Env vars the backend needs. Returns a comma-joined list of any that are
// missing (so a misconfigured deploy fails loudly instead of half-working),
// or null when all present.
export function missingEnv(env: Env): string | null {
  const need = [
    'GITHUB_CLIENT_ID',
    'GITHUB_CLIENT_SECRET',
    'SESSION_SECRET',
    'UPSTREAM_REPO',
    'APP_SLUG',
  ] as const
  const missing = need.filter((k) => !env[k])
  return missing.length ? missing.join(', ') : null
}

// Whether a request that changes something came from the wizard's own pages.
// The session cookie is SameSite=Lax, so another site can't send it on a POST
// anyway; this is the second lock on the same door.
export function sameOrigin(request: Request): boolean {
  return request.headers.get('Origin') === new URL(request.url).origin
}

// The send endpoints answer failures as `{ error: code, message? }`, and the
// Send step decides what to show from the code. `message` is for people.
export const failure = (status: number, error: string, message?: string) =>
  json({ error, message }, status, PRIVATE)

/** The response for something that went wrong while talking to GitHub. */
export function githubFailure(e: unknown): Response {
  if (e instanceof GitHubError) {
    // Revoked or expired at GitHub's end: this session can't act any more.
    if (e.status === 401) return failure(401, 'reauth')
    console.error('GitHub call failed', e.status, e.message)
    return failure(502, 'github', e.message)
  }
  console.error('Unexpected failure', e)
  return failure(500, 'server', 'Something went wrong on our side.')
}
