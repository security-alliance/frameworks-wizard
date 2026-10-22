// Minimal cookie parse/serialize for the auth Worker.
// No dependency — the runtime gives us the Request/Response and Headers API.

import { BASE_PATH } from './env.js'

export function parseCookies(request: Request): Record<string, string> {
  const header = request.headers.get('Cookie') || ''
  const out: Record<string, string> = {}
  for (const part of header.split(';')) {
    const idx = part.indexOf('=')
    if (idx === -1) continue
    const k = part.slice(0, idx).trim()
    if (!k) continue
    out[k] = decodeURIComponent(part.slice(idx + 1).trim())
  }
  return out
}

export interface CookieOptions {
  /** Seconds. 0 clears the cookie. */
  maxAge?: number
  path?: string
  httpOnly?: boolean
  secure?: boolean
  sameSite?: 'Lax' | 'Strict' | 'None'
}

// Secure by default: HttpOnly + Secure + SameSite=Lax. Pass maxAge in seconds
// (0 clears the cookie). SameSite=Lax is required so the cookie survives the
// top-level redirect back from GitHub's OAuth screen. Scoped to the app's path,
// so the browser doesn't attach it to the docs pages sharing the domain.
export function serializeCookie(
  name: string,
  value: string,
  opts: CookieOptions = {},
): string {
  const parts = [`${name}=${encodeURIComponent(value)}`]
  if (opts.maxAge != null) parts.push(`Max-Age=${Math.floor(opts.maxAge)}`)
  parts.push(`Path=${opts.path || BASE_PATH}`)
  if (opts.httpOnly !== false) parts.push('HttpOnly')
  if (opts.secure !== false) parts.push('Secure')
  parts.push(`SameSite=${opts.sameSite || 'Lax'}`)
  return parts.join('; ')
}
