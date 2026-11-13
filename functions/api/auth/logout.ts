// POST /wizard/api/auth/logout — sign out. POST-only so a stray link or
// prefetch can't sign the user out, and only from the wizard's own pages, so
// another site can't either.
//
// Clearing the cookie alone would leave the GitHub token inside it valid until
// it expires, up to 8 hours, for anyone who copied the cookie before. So the
// token is revoked at GitHub too. That ends this one token only: the
// contributor's authorization of the app and the app's install on their fork
// stay as they are, and signing in again is the same one click as before.

import { clearSession, readSession } from '../../_lib/session.js'
import { failure, json, missingEnv, sameOrigin } from '../../_lib/http.js'
import type { Ctx } from '../../_lib/env.js'

export async function onRequestPost({ request, env }: Ctx): Promise<Response> {
  if (!sameOrigin(request)) return failure(403, 'invalid', 'Requests must come from the wizard.')

  const session = missingEnv(env) ? null : await readSession(env, request)
  if (session) {
    // Best effort: whatever GitHub answers, the cookie is cleared below.
    await fetch(`https://api.github.com/applications/${env.GITHUB_CLIENT_ID}/token`, {
      method: 'DELETE',
      headers: {
        Authorization: `Basic ${btoa(`${env.GITHUB_CLIENT_ID}:${env.GITHUB_CLIENT_SECRET}`)}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'frameworks-contribution-wizard',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ access_token: session.token }),
    })
      .then((res) => {
        if (!res.ok && res.status !== 404) console.error('Token revoke failed', res.status)
      })
      .catch((e) => console.error('Token revoke failed', e))
  }

  return json({ ok: true }, 200, { 'Set-Cookie': clearSession() })
}
