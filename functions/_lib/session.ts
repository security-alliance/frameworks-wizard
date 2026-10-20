// Session = an AES-GCM-encrypted cookie holding the GitHub user token + minimal
// identity. Encrypted so the token is never exposed even as a cookie value, and
// HttpOnly so client-side JS can't read it at all. The frontend only learns the
// user's *public* identity via /api/auth/me — never the token.

import { parseCookies, serializeCookie } from './cookies.js'
import { encryptJSON, decryptJSON } from './crypto.js'
import type { Env } from './env.js'

export const SESSION_COOKIE = 'cw_session'
const SESSION_TTL = 60 * 60 * 8 // 8 hours

/**
 * What the encrypted session cookie carries.
 *
 * `token` never leaves the server: /api/auth/me returns only the public
 * identity fields below it. Typing the shape is what keeps that split visible —
 * anything added here is, by default, secret.
 */
export interface Session {
  token: string
  refreshToken: string | null
  /** Epoch ms, for GitHub Apps with expiring tokens. */
  tokenExpiresAt: number | null
  login: string
  name: string
  avatar: string
  userId: number
  /** Issued-at, stamped by `writeSession`. */
  iat?: number
}

// Returns a Set-Cookie value carrying the encrypted session.
export async function writeSession(env: Env, data: Session): Promise<string> {
  const token = await encryptJSON({ ...data, iat: Date.now() }, env.SESSION_SECRET)
  return serializeCookie(SESSION_COOKIE, token, { maxAge: SESSION_TTL })
}

// Returns the decrypted session object, or null if absent/tampered/expired.
export async function readSession(env: Env, request: Request): Promise<Session | null> {
  const token = parseCookies(request)[SESSION_COOKIE]
  if (!token) return null
  const data = await decryptJSON<Session>(token, env.SESSION_SECRET)
  if (!data) return null
  if (data.iat && Date.now() - data.iat > SESSION_TTL * 1000) return null
  return data
}

export function clearSession(): string {
  return serializeCookie(SESSION_COOKIE, '', { maxAge: 0 })
}
