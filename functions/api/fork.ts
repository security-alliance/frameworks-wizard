// GET /wizard/api/fork — is the contributor's copy of the docs ready to send
// from? The Send step asks before sending, and again while the one-time setup is
// open, so it can tick each step off as the contributor finishes it on GitHub.

import { readSession, tokenUsable } from '../_lib/session.js'
import { PRIVATE, failure, githubFailure, json, missingEnv } from '../_lib/http.js'
import { findFork, type ForkState } from '../_lib/fork.js'
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
        installUrl: installUrl(env.APP_SLUG, session.userId, fork),
      },
      200,
      PRIVATE,
    )
  } catch (e) {
    return githubFailure(e)
  }
}

// GitHub's install screen offers "All repositories" first, which would give
// the app every repo on the contributor's account. Once their fork exists, the
// link names their account (`suggested_target_id`) and the fork
// (`repository_ids[]`), so the screen opens on "Only select repositories" with
// just the fork ticked. `suggested_target_id` is the one that carries the
// repository selection; `target_id` only picks the account. Until the fork
// exists there's nothing to select, so the plain link. Either way the Send step
// tells the contributor what the screen should show before they click Install.
function installUrl(slug: string, userId: number, fork: ForkState): string {
  const base = `https://github.com/apps/${slug}/installations/new`
  if (fork.status !== 'needs-install') return base
  const q = new URLSearchParams({ suggested_target_id: String(userId) })
  q.append('repository_ids[]', String(fork.repoId))
  return `${base}/permissions?${q}`
}
