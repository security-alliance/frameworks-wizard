// POST /api/auth/logout — clear the session cookie. POST-only so a stray link
// or prefetch can't sign the user out.

import { clearSession } from '../../_lib/session.js'
import { json } from '../../_lib/http.js'

export async function onRequestPost(): Promise<Response> {
  return json({ ok: true }, 200, { 'Set-Cookie': clearSession() })
}
