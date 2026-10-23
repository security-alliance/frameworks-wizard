// GET /wizard/api/fork — is the contributor's copy of the docs ready to send
// from? The Send step asks before sending, and again while the one-time setup is
// open, so it can tick each step off as the contributor finishes it on GitHub.

import { readSession, tokenUsable } from '../_lib/session.js'
import { PRIVATE, failure, githubFailure, json, missingEnv } from '../_lib/http.js'
import { findFork } from '../_lib/fork.js'
import type { Ctx } from '../_lib/env.js'

export async function onRequestGet({ request, env }: Ctx): Promise<Response> {
  const missing = missingEnv(env)
  if (missing) return failure(500, 'server', `Server not configured: missing ${missing}`)

  const session = await readSession(env, request)
  if (!session || !tokenUsable(session)) return failure(401, 'reauth')

  try {
    const fork = await findFork(session.token, session, env.UPSTREAM_REPO)
    return json(
      {
        ...fork,
        // GitHub's own pages for the two setup steps.
        forkUrl: `https://github.com/${env.UPSTREAM_REPO}/fork`,
        installUrl: `https://github.com/apps/${env.APP_SLUG}/installations/new`,
      },
      200,
      PRIVATE,
    )
  } catch (e) {
    return githubFailure(e)
  }
}
