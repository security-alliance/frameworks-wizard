// GET /api/auth/login — start the GitHub App user-authorization flow.
// We mint a random CSRF `state`, sign it, stash it in a short-lived HttpOnly
// cookie, and redirect the user to GitHub. The callback verifies both.

import { serializeCookie } from '../../_lib/cookies.js'
import { sign } from '../../_lib/crypto.js'
import { json, missingEnv } from '../../_lib/http.js'
import type { Ctx } from '../../_lib/env.js'

const STATE_COOKIE = 'cw_oauth_state'

export async function onRequestGet({ request, env }: Ctx): Promise<Response> {
  const missing = missingEnv(env)
  if (missing) return json({ error: `Server not configured: missing ${missing}` }, 500)

  const origin = new URL(request.url).origin
  const redirectUri = `${origin}/api/auth/callback`

  // CSRF protection: unguessable, signed state echoed back by GitHub.
  const state = await sign(crypto.randomUUID(), env.SESSION_SECRET)

  const authorize = new URL('https://github.com/login/oauth/authorize')
  authorize.searchParams.set('client_id', env.GITHUB_CLIENT_ID)
  authorize.searchParams.set('redirect_uri', redirectUri)
  authorize.searchParams.set('state', state)
  // Note: for a GitHub App, permissions come from the app's config, not a
  // `scope` param — so we don't request scopes here.

  // Always put GitHub's account screen in front of the user. Without this, a
  // visitor who has authorized the app before and still has a github.com session
  // is bounced straight back signed in, with nothing shown and nothing to
  // confirm — including on a shared or borrowed machine, where the account they
  // silently get is whoever used the browser last. `select_account` makes GitHub
  // ask every time, so signing in is always a deliberate act and the contributor
  // can see which identity their suggestion will be filed under.
  authorize.searchParams.set('prompt', 'select_account')
  // Offer "Create an account" on GitHub's own screen to people who don't have one.
  authorize.searchParams.set('allow_signup', 'true')

  return new Response(null, {
    status: 302,
    headers: {
      Location: authorize.toString(),
      'Set-Cookie': serializeCookie(STATE_COOKIE, state, { maxAge: 600 }),
    },
  })
}
