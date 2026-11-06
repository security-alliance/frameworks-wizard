// GET /wizard/api/prs — the contributor's open pull requests on the docs, for
// the account menu: what they've sent that is still waiting for review.
//
// One search, with their own token. PRs they opened by hand count too: they're
// suggestions to the same docs, and telling them apart would mean guessing
// from branch names.

import { readSession, tokenUsable } from '../_lib/session.js'
import { PRIVATE, failure, githubFailure, json, missingEnv } from '../_lib/http.js'
import { ghGraphql } from '../_lib/github.js'
import type { Ctx } from '../_lib/env.js'

const SEARCH = `query ($q: String!) {
  search(query: $q, type: ISSUE, first: 10) {
    issueCount
    nodes { ... on PullRequest { number title url isDraft reviewDecision updatedAt } }
  }
}`

interface Pr {
  number: number
  title: string
  url: string
  isDraft: boolean
  reviewDecision: 'APPROVED' | 'CHANGES_REQUESTED' | 'REVIEW_REQUIRED' | null
  updatedAt: string
}

export async function onRequestGet({ request, env }: Ctx): Promise<Response> {
  const missing = missingEnv(env)
  if (missing) return failure(500, 'server', `Server not configured: missing ${missing}`)

  const session = await readSession(env, request)
  if (!session || !tokenUsable(session)) return failure(401, 'reauth')

  const filter = `is:pr is:open author:${session.login}`
  try {
    const { search } = await ghGraphql<{ search: { issueCount: number; nodes: Pr[] } }>(
      session.token,
      SEARCH,
      { q: `repo:${env.UPSTREAM_REPO} ${filter} sort:updated-desc` },
    )
    return json(
      {
        prs: search.nodes.filter((n) => n && n.number),
        total: search.issueCount,
        all: `https://github.com/${env.UPSTREAM_REPO}/pulls?q=${encodeURIComponent(filter)}`,
      },
      200,
      PRIVATE,
    )
  } catch (e) {
    return githubFailure(e)
  }
}
