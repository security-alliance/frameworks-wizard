// GET /wizard/api/auth/me — the only thing the browser is allowed to know about auth:
// whether there's a session, and the signed-in user's PUBLIC identity.
// The GitHub token is deliberately never included in this response.

import { readSession } from '../../_lib/session.js'
import { json, missingEnv } from '../../_lib/http.js'
import type { Ctx } from '../../_lib/env.js'

// Who is signed in is per-request and per-person. `no-store` keeps it out of
// every cache between here and the browser, so the next visitor on a shared
// machine — or behind a shared proxy — can't be handed the last one's identity.
const PRIVATE = { 'Cache-Control': 'no-store, private', Vary: 'Cookie' }

export async function onRequestGet({ request, env }: Ctx): Promise<Response> {
  const missing = missingEnv(env)
  if (missing) return json({ error: `Server not configured: missing ${missing}` }, 500, PRIVATE)

  const session = await readSession(env, request)
  if (!session) return json({ authenticated: false }, 200, PRIVATE)
  return json(
    {
      authenticated: true,
      login: session.login,
      name: session.name,
      avatar: session.avatar,
    },
    200,
    PRIVATE,
  )
}
