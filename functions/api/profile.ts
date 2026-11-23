// GET /wizard/api/profile — what the Send step's profile card starts from:
// the contributor's public GitHub profile, and whether one of their open pull
// requests already adds their contributors.json profile (then it isn't offered
// again, or two suggestions would both add it).

import { readSession, tokenUsable } from '../_lib/session.js'
import { PRIVATE, failure, githubFailure, json, missingEnv } from '../_lib/http.js'
import { gh, ghGraphql } from '../_lib/github.js'
import { CONTRIBUTORS_FILE } from '../_lib/profile.js'
import type { Ctx } from '../_lib/env.js'

interface GitHubUser {
  login: string
  name: string | null
  company: string | null
  blog: string | null
  twitter_username: string | null
}

const OPEN_PRS = `query ($q: String!) {
  search(query: $q, type: ISSUE, first: 10) {
    nodes { ... on PullRequest { files(first: 100) { nodes { path } } } }
  }
}`

export async function onRequestGet({ request, env }: Ctx): Promise<Response> {
  const missing = missingEnv(env)
  if (missing) return failure(500, 'server', `Server not configured: missing ${missing}`)

  const session = await readSession(env, request)
  if (!session || !tokenUsable(session)) return failure(401, 'reauth')

  try {
    const [user, open] = await Promise.all([
      gh<GitHubUser>(session.token, '/user'),
      ghGraphql<{ search: { nodes: { files?: { nodes: { path: string }[] } }[] } }>(session.token, OPEN_PRS, {
        q: `repo:${env.UPSTREAM_REPO} is:pr is:open author:${session.login}`,
      }),
    ])
    const pending = open.search.nodes.some((pr) => pr.files?.nodes.some((f) => f.path === CONTRIBUTORS_FILE))
    const blog = user.blog?.trim() ?? ''
    return json(
      {
        login: user.login,
        name: user.name ?? '',
        // GitHub's company field is often an @org mention.
        company: (user.company ?? '').replace(/^@/, ''),
        website: blog && !/^https?:\/\//.test(blog) ? `https://${blog}` : blog,
        twitter: user.twitter_username ?? '',
        pending,
      },
      200,
      PRIVATE,
    )
  } catch (e) {
    return githubFailure(e)
  }
}
