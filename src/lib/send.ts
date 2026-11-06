// Sending a suggestion, from the browser's side.
//
// Like sign-in, the browser never holds a token. It asks the backend whether
// the contributor's copy of the docs is ready, and hands it the edit; the
// backend acts as the contributor with the token in their session cookie, and
// decides where everything goes. See functions/api/fork.ts and submit.ts.

import { AUTH_API } from './useAuth.js'
import { rememberReturn } from './useWizardRoute.js'

const API = `${import.meta.env.BASE_URL}api`

/** Off to GitHub to sign in, and back to this same step afterwards. */
export function signInAndComeBack(): void {
  rememberReturn()
  window.location.href = `${AUTH_API}/login`
}

/** What GET /api/fork says about the contributor's copy. */
export interface ForkCheck {
  status: 'ready' | 'needs-install' | 'needs-fork'
  /** Their copy, once it exists: `octocat/frameworks`. */
  repo?: string
  /** GitHub's Fork page for the upstream repo. */
  forkUrl: string
  /** GitHub's page for installing the app. */
  installUrl: string
}

export interface SubmitFile {
  path: string
  /** The whole file as it was loaded, frontmatter included. */
  original: string
  /** The whole file with the contributor's edit. */
  content: string
}

export interface SubmitInput {
  /** Every page in the suggestion: one commit, one pull request. */
  files: SubmitFile[]
  title: string
  body: string
}

/** What /api/submit answers. */
interface Submitted {
  url: string
  number: number
  /** Someone changed the same lines upstream while they were writing. */
  overlap: boolean
  /** Which pages that happened on. */
  overlapPaths?: string[]
}

export interface Sent extends Submitted {
  /** The pages' names, for the Done step. */
  pages: string[]
  /** Their paths, so their drafts can be cleared. */
  paths: string[]
  /** Saved before suggestions could span pages; read by the Done step. */
  page?: string
}

/** One of the contributor's open pull requests, for the account menu. */
export interface OpenPr {
  number: number
  title: string
  url: string
  isDraft: boolean
  reviewDecision: 'APPROVED' | 'CHANGES_REQUESTED' | 'REVIEW_REQUIRED' | null
  updatedAt: string
}

/** Why sending can't go ahead, in the terms the Send step acts on. */
export type SendProblem =
  /** The session or its token ran out: sign in again. */
  | { kind: 'expired' }
  /** The one-time setup isn't done, or was undone on GitHub. */
  | { kind: 'needs-setup' }
  /** Their copy needs a "Sync fork" before these pages can be sent from it. */
  | { kind: 'needs-sync'; repo: string; pages: string[] }
  /** These pages were moved or removed upstream. */
  | { kind: 'gone'; pages: string[] }
  /** Their copy already has these pages' changes. */
  | { kind: 'unchanged'; pages: string[] }
  | { kind: 'error'; message: string }

type Result<T> = { ok: true; value: T } | { ok: false; problem: SendProblem }

const fail = (problem: SendProblem): { ok: false; problem: SendProblem } => ({ ok: false, problem })

async function call<T>(path: string, init?: RequestInit): Promise<Result<T>> {
  let res: Response
  try {
    res = await fetch(`${API}/${path}`, { credentials: 'same-origin', ...init })
  } catch {
    return fail({
      kind: 'error',
      message: "Couldn't reach the wizard. Check your connection and try again.",
    })
  }
  const data = await res.json().catch(() => null)
  if (res.ok && data) return { ok: true, value: data as T }

  const { error, message, repo, pages = [] } = (data ?? {}) as {
    error?: string
    message?: string
    repo?: string
    pages?: string[]
  }
  if (error === 'reauth') return fail({ kind: 'expired' })
  if (error === 'needs-setup') return fail({ kind: 'needs-setup' })
  if (error === 'needs-sync' && repo) return fail({ kind: 'needs-sync', repo, pages })
  if (error === 'gone' || error === 'unchanged') return fail({ kind: error, pages })
  if (error === 'github' && message) {
    return fail({ kind: 'error', message: `GitHub didn't accept it: “${message}”` })
  }
  return fail({
    kind: 'error',
    message: message ?? `Something went wrong (${res.status}). Try again in a moment.`,
  })
}

export const checkFork = () => call<ForkCheck>('fork')

export const submit = (input: SubmitInput) =>
  call<Submitted>('submit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })

export const listPrs = () => call<{ prs: OpenPr[]; total: number; all: string }>('prs')

// The last suggestion sent from this tab, so reloading the Done step still
// shows it instead of an empty page that reads as if it got lost.
const SENT_KEY = 'fw-sent'

export function rememberSent(sent: Sent): void {
  try {
    sessionStorage.setItem(SENT_KEY, JSON.stringify(sent))
  } catch {
    /* only a reload of the Done step loses it */
  }
}

export function forgetSent(): void {
  try {
    sessionStorage.removeItem(SENT_KEY)
  } catch {
    /* nothing to do */
  }
}

export function lastSent(): Sent | null {
  try {
    const raw = sessionStorage.getItem(SENT_KEY)
    return raw ? (JSON.parse(raw) as Sent) : null
  } catch {
    return null
  }
}
