// POST /wizard/api/submit — send the contributor's suggestion: commit their
// edited page to a new branch in their copy, and open a pull request from it.
//
// The browser sends the page's path, the page as it loaded it, the page as the
// contributor left it, and the pull request's title and body. Where it all goes,
// which repo and which branch, is decided here and nowhere else.
//
// WHERE THE BRANCH STARTS
//
// The obvious move, bringing their copy up to date first, is the one GitHub
// refuses most often: a sync that brings in changes to `.github/workflows` needs
// the Workflows permission, which this app deliberately doesn't have, and
// upstream changes its workflows every few weeks. So the branch starts at the
// last commit their copy and upstream share, which adds nothing new to the copy,
// and their edit is replayed onto that commit's version of the page. Whatever
// upstream changed since then, GitHub combines when the pull request is merged;
// `develop` doesn't require branches to be up to date.
//
// The one case that needs the contributor: the page in their copy differs from
// the one they edited, in the same lines. Then they're asked to click "Sync fork"
// on GitHub, which works where the app can't, because it's them doing it.

import { readSession, tokenUsable } from '../_lib/session.js'
import { PRIVATE, failure, githubFailure, json, missingEnv, sameOrigin } from '../_lib/http.js'
import { GitHubError, encodePath, gh, ghGraphql, readFile, toBase64 } from '../_lib/github.js'
import { findFork } from '../_lib/fork.js'
import { merge3 } from '../_lib/merge.js'
import { BRANCH, type Ctx } from '../_lib/env.js'

interface Input {
  path: string
  /** The page as the browser loaded it: where the contributor's edit starts. */
  original: string
  /** The page with their edit. */
  content: string
  title: string
  body: string
}

// The commit is made through GraphQL rather than REST's "update a file": GitHub
// signs commits made this way itself, so they show as Verified, the way every
// outside commit merged into frameworks does, and authors them as the token's
// owner, the contributor. The REST call makes the same commit unsigned.
const CREATE_COMMIT = `mutation ($input: CreateCommitOnBranchInput!) {
  createCommitOnBranch(input: $input) { commit { oid } }
}`

// The largest docs page is under 50 KB.
const MAX_PAGE = 500_000
const MAX_TITLE = 200
// GitHub's limit is 65,536 characters; this leaves room for `withConflictWarning`.
const MAX_BODY = 60_000

export async function onRequestPost({ request, env }: Ctx): Promise<Response> {
  const missing = missingEnv(env)
  if (missing) return failure(500, 'server', `Server not configured: missing ${missing}`)
  if (!sameOrigin(request)) return failure(403, 'invalid', 'Requests must come from the wizard.')

  const session = await readSession(env, request)
  if (!session || !tokenUsable(session)) return failure(401, 'reauth')

  const input = await readInput(request)
  if (typeof input === 'string') return failure(400, 'invalid', input)

  const { token } = session
  const upstream = env.UPSTREAM_REPO
  try {
    const fork = await findFork(token, session, upstream)
    if (fork.status !== 'ready') return failure(409, 'needs-setup')

    const { merge_base_commit } = await gh<{ merge_base_commit: { sha: string } }>(
      token,
      `/repos/${upstream}/compare/${BRANCH}...${fork.owner}:${encodeURIComponent(fork.branch)}?per_page=1`,
    )
    const base = merge_base_commit.sha

    const [inCopy, upstreamNow] = await Promise.all([
      readFile(token, fork.repo, input.path, base),
      readFile(token, upstream, input.path, BRANCH),
    ])
    if (!upstreamNow) {
      return failure(
        400,
        'invalid',
        'This page has been moved or removed since you opened it, so there is nothing to send your change to.',
      )
    }
    // Their copy needs the contributor's own "Sync fork" first. `repo` is so the
    // Send step can link to it.
    const needsSync = () => json({ error: 'needs-sync', repo: fork.repo }, 409, PRIVATE)
    // The page is newer than their copy: there's nothing in the copy to edit.
    if (!inCopy) return needsSync()

    const merged =
      inCopy === input.original
        ? input.content
        : merge3(inCopy, input.original, input.content)
    if (merged === null) return needsSync()
    if (merged === inCopy) {
      return failure(400, 'invalid', 'Your copy of this page already has this change.')
    }

    // Did someone change the same lines on `develop` while they wrote? Then
    // GitHub will report a conflict, and both sides are told. A change
    // elsewhere in the page isn't worth a word: GitHub combines it on merge.
    const overlap =
      upstreamNow !== input.original && merge3(upstreamNow, input.original, input.content) === null

    const branch = await createBranch(token, fork.repo, input.path, base)
    try {
      await ghGraphql(token, CREATE_COMMIT, {
        input: {
          branch: { repositoryNameWithOwner: fork.repo, branchName: branch },
          // GitHub refuses the commit if the branch moved since it was made.
          expectedHeadOid: base,
          message: { headline: input.title },
          fileChanges: { additions: [{ path: input.path, contents: toBase64(merged) }] },
        },
      })
      const pr = await gh<{ html_url: string; number: number }>(token, `/repos/${upstream}/pulls`, {
        method: 'POST',
        body: {
          title: input.title,
          body: overlap ? withConflictWarning(input.body) : input.body,
          head: `${fork.owner}:${branch}`,
          base: BRANCH,
          // So maintainers can fix a typo themselves instead of asking for it.
          maintainer_can_modify: true,
        },
      })
      return json({ url: pr.html_url, number: pr.number, overlap }, 200, PRIVATE)
    } catch (e) {
      // Don't leave a half-made branch behind in their copy.
      await gh(token, `/repos/${fork.repo}/git/refs/heads/${encodePath(branch)}`, {
        method: 'DELETE',
      }).catch(() => {})
      throw e
    }
  } catch (e) {
    return githubFailure(e)
  }
}

// A string is the reason the input was refused, written for the contributor.
async function readInput(request: Request): Promise<Input | string> {
  if (!request.headers.get('Content-Type')?.startsWith('application/json')) {
    return 'Expected JSON.'
  }
  let data: Partial<Record<keyof Input, unknown>>
  try {
    data = await request.json()
  } catch {
    return 'Expected JSON.'
  }
  const { path, original, content, title, body } = data ?? {}
  if (typeof path !== 'string' || !isEditablePage(path)) {
    return "This page can't be edited with the wizard."
  }
  if (
    typeof original !== 'string' ||
    typeof content !== 'string' ||
    original.length > MAX_PAGE ||
    content.length > MAX_PAGE
  ) {
    return 'This page is too large to send.'
  }
  if (original === content) return 'There are no changes to send.'
  if (typeof title !== 'string' || !title.trim() || title.length > MAX_TITLE || /[\r\n]/.test(title)) {
    return 'The title is missing or too long.'
  }
  if (typeof body !== 'string' || body.length > MAX_BODY) return 'The description is too long.'
  return { path, original, content, title: title.trim(), body }
}

// The same rules as the page picker (isEditablePage in src/lib/github.ts): an
// .mdx under docs/pages/, never the generated index.mdx or a `_` layout file.
// Checked again here because the picker runs in the browser.
const PAGE_PATH = /^docs\/pages\/(?:[\w.-]+\/)*[\w.-]+\.mdx$/

function isEditablePage(path: string): boolean {
  if (!PAGE_PATH.test(path)) return false
  const parts = path.split('/')
  if (parts.some((p) => p === '.' || p === '..')) return false
  const name = parts[parts.length - 1]
  return name !== 'index.mdx' && !name.startsWith('_')
}

// `wizard/opsec-travel-guide-20261023`, with `-2`, `-3`… for a second
// suggestion to the same page on the same day.
async function createBranch(token: string, repo: string, path: string, sha: string): Promise<string> {
  const slug = path
    .replace(/^docs\/pages\//, '')
    .replace(/\.mdx$/, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60)
  const day = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  const stem = `wizard/${slug}-${day}`

  for (let n = 1; n <= 5; n++) {
    const name = n === 1 ? stem : `${stem}-${n}`
    try {
      await gh(token, `/repos/${repo}/git/refs`, {
        method: 'POST',
        body: { ref: `refs/heads/${name}`, sha },
      })
      return name
    } catch (e) {
      // 422 is "already exists"; anything else is a real failure.
      if (!(e instanceof GitHubError && e.status === 422)) throw e
    }
  }
  const name = `${stem}-${crypto.randomUUID().slice(0, 8)}`
  await gh(token, `/repos/${repo}/git/refs`, {
    method: 'POST',
    body: { ref: `refs/heads/${name}`, sha },
  })
  return name
}

// The description ends with the wizard's one-line footer (see buildPrBody), so
// the warning goes just above it, after the checklist.
function withConflictWarning(body: string): string {
  const warning = [
    '> [!WARNING]',
    '> This page changed on `develop` while the contributor was writing, in lines this suggestion also edits, so GitHub will report a conflict. "Allow edits by maintainers" is on, so it can be resolved here.',
  ].join('\n')
  const footer = body.lastIndexOf('\n\n')
  return footer < 0
    ? `${body}\n\n${warning}`
    : `${body.slice(0, footer)}\n\n${warning}${body.slice(footer)}`
}
