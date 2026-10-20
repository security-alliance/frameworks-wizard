// GET /api/auth/callback — GitHub redirects here with ?code&state.
// Verify the CSRF state, exchange the code for a user token (server-side, the
// client secret never leaves this function), look up the user, and store an
// encrypted session cookie. On any failure we bounce back to the app with an
// ?auth_error the UI can show.

import { parseCookies, serializeCookie } from '../../_lib/cookies.js'
import { timingSafeEqual, verify } from '../../_lib/crypto.js'
import { writeSession } from '../../_lib/session.js'
import { json, missingEnv } from '../../_lib/http.js'
import type { Ctx } from '../../_lib/env.js'

const STATE_COOKIE = 'cw_oauth_state'

/** GitHub's `POST /login/oauth/access_token` response. */
interface TokenResponse {
  access_token?: string
  refresh_token?: string
  /** Seconds, for GitHub Apps with expiring tokens. */
  expires_in?: number
}

/** The fields of `GET /user` this flow reads. */
interface GitHubUser {
  login: string
  name: string | null
  avatar_url: string
  id: number
}

export async function onRequestGet({ request, env }: Ctx): Promise<Response> {
  const missing = missingEnv(env)
  if (missing) return json({ error: `Server not configured: missing ${missing}` }, 500)

  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const cookieState = parseCookies(request)[STATE_COOKIE]

  // The state GitHub echoes must exactly match the cookie we set AND carry a
  // valid signature. Either check failing means a forged/replayed callback.
  if (!code || !state || !cookieState || !timingSafeEqual(state, cookieState)) {
    return backToApp(url.origin, 'state_mismatch')
  }
  if (!(await verify(state, env.SESSION_SECRET))) {
    return backToApp(url.origin, 'state_invalid')
  }

  // Exchange code -> user access token. Secret stays here, server-side.
  const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      client_id: env.GITHUB_CLIENT_ID,
      client_secret: env.GITHUB_CLIENT_SECRET,
      code,
      redirect_uri: `${url.origin}/api/auth/callback`,
    }),
  })
  const tokenData = await tokenRes
    .json<TokenResponse>()
    .catch((): TokenResponse => ({}))
  if (!tokenData.access_token) return backToApp(url.origin, 'token_exchange_failed')

  // Identify the user, for display and, once submitting is wired up, PR attribution.
  const userRes = await fetch('https://api.github.com/user', {
    headers: {
      Authorization: `Bearer ${tokenData.access_token}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'frameworks-contribution-wizard',
    },
  })
  if (!userRes.ok) return backToApp(url.origin, 'user_lookup_failed')
  const user = await userRes.json<GitHubUser>()

  const sessionCookie = await writeSession(env, {
    // Token stays encrypted + server-side; never sent to the browser.
    token: tokenData.access_token,
    refreshToken: tokenData.refresh_token || null,
    // GitHub Apps with expiring tokens include expires_in (seconds).
    tokenExpiresAt: tokenData.expires_in
      ? Date.now() + tokenData.expires_in * 1000
      : null,
    login: user.login,
    name: user.name || user.login,
    avatar: user.avatar_url,
    userId: user.id,
  })

  const headers = new Headers()
  headers.append('Set-Cookie', sessionCookie)
  headers.append('Set-Cookie', serializeCookie(STATE_COOKIE, '', { maxAge: 0 }))
  headers.set('Location', `${url.origin}/?connected=1`)
  return new Response(null, { status: 302, headers })
}

function backToApp(origin: string, error: string): Response {
  const headers = new Headers()
  // Clear any stale state cookie on the way out.
  headers.append('Set-Cookie', serializeCookie(STATE_COOKIE, '', { maxAge: 0 }))
  headers.set('Location', `${origin}/?auth_error=${encodeURIComponent(error)}`)
  return new Response(null, { status: 302, headers })
}
