// Finding the contributor's copy of the docs: their fork of the upstream repo,
// with the app installed on it.
//
// Suggestions are sent from the contributor's own fork, the same way anyone
// outside the project opens a pull request by hand. The app is installed on
// that fork alone, so it can't write anywhere else on their account. Both are
// one-time steps the contributor does on GitHub's own pages; this works out
// which of them is still missing.

import { gh, ghOrNull } from './github.js'
import type { Session } from './session.js'

export type ForkState =
  | { status: 'ready'; repo: string; owner: string; branch: string }
  /** Their fork exists, but the app can't write to it yet. */
  | { status: 'needs-install'; repo: string }
  | { status: 'needs-fork' }

interface Repo {
  full_name: string
  name: string
  fork: boolean
  default_branch: string
  owner: { login: string }
  /** Only on a single-repo GET, not in listings. */
  parent?: { full_name: string }
  source?: { full_name: string }
}

interface Installation {
  id: number
  account: { id: number } | null
}

export async function findFork(
  token: string,
  session: Session,
  upstream: string,
): Promise<ForkState> {
  const want = upstream.toLowerCase()
  const upstreamName = want.split('/')[1]
  // `source` as well as `parent`, so a fork of someone else's fork still counts:
  // it's in the same network, and pull requests from it work the same.
  const isOurFork = (r: Repo) =>
    r.fork &&
    [r.parent?.full_name, r.source?.full_name].some((n) => n?.toLowerCase() === want)

  // Installations of this app the contributor can see. Organisations they belong
  // to can have it too, so pick the one on their own account.
  const { installations } = await gh<{ installations: Installation[] }>(
    token,
    '/user/installations?per_page=100',
  )
  const mine = installations.find((i) => i.account?.id === session.userId)

  if (mine) {
    const { repositories } = await gh<{ repositories: Repo[] }>(
      token,
      `/user/installations/${mine.id}/repositories?per_page=100`,
    )
    // Normally exactly one repo, the fork. Listings don't say what a fork is a
    // fork of, so each candidate is looked up, the likeliest name first.
    const candidates = repositories
      .filter((r) => r.fork)
      .sort(
        (a, b) =>
          Number(b.name.toLowerCase() === upstreamName) -
          Number(a.name.toLowerCase() === upstreamName),
      )
      .slice(0, 5)
    for (const c of candidates) {
      const repo = await gh<Repo>(token, `/repos/${c.full_name}`)
      if (isOurFork(repo)) {
        return {
          status: 'ready',
          repo: repo.full_name,
          owner: repo.owner.login,
          branch: repo.default_branch,
        }
      }
    }
  }

  // Not reachable through the app. GitHub names a fork after the original
  // unless that name is taken, so this finds nearly every existing fork; one
  // under another name shows up above as soon as the app is installed on it.
  const guess = await ghOrNull<Repo>(token, `/repos/${session.login}/${upstreamName}`)
  if (guess && isOurFork(guess)) return { status: 'needs-install', repo: guess.full_name }
  return { status: 'needs-fork' }
}
