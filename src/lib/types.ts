// The shapes the wizard passes between its layers.
//
// These live in one file rather than beside their producers because they are
// contracts, not implementation: `Block` in particular is the thing the whole
// editor rests on, and its invariant is stated once, here, where anyone reading
// it will find it.

/* ------------------------------------------------------------------ *
 * the block model
 * ------------------------------------------------------------------ */

/**
 * What a block of a page is.
 *
 * `spacer` is blank lines in the source (and `<br />` spacing): it exists so the
 * page rejoins byte-for-byte, and renders as nothing. `comment` is an MDX
 * comment, `{/* … *\/}`, on lines of its own: invisible on the site, so hidden
 * here too and kept exactly as written. `frameOpen` and
 * `frameClose` are the tags of a component that wraps ordinary text, like
 * `<Checklist>` or `<details>`: the tags stay exactly as written, and the text
 * between them is split into blocks of its own. Keeping the kinds as a union
 * rather than loose strings is what makes every `switch` over them exhaustive —
 * adding a kind is then a compile error at each place that has to handle it,
 * instead of a silent fall-through to the read-only branch.
 */
export type BlockKind =
  | 'prose'
  | 'title'
  | 'managed'
  | 'frameOpen'
  | 'frameClose'
  | 'raw'
  | 'spacer'
  | 'comment'

/**
 * One editable section of a page.
 *
 * Invariants, both load-bearing:
 *
 *   - `text + trail === raw` for a block that hasn't been edited. `trail` holds
 *     the blank lines that followed the block, peeled off the content so an
 *     edit preserves the spacing around it exactly.
 *   - `pristine` is the original `text`, kept so a block edited back to its
 *     starting content can go back to emitting its original bytes rather than
 *     a re-serialized equivalent.
 */
export interface Block {
  id: string
  kind: BlockKind
  /** 0-based line in the page body where this block starts. */
  startLine: number
  /** The block's source, verbatim, including its trailing blank lines. */
  raw: string
  /** The block's content, without trailing blank lines. */
  text: string
  /** `text` as it was when the page loaded. */
  pristine: string
  /** The blank lines that followed the block. */
  trail: string
  edited: boolean
  /** On `frameOpen` and `frameClose`: the wrapping component, `Checklist`. */
  frame?: string
  /** On blocks inside a frame: the innermost wrapping component. */
  inside?: string
}

/* ------------------------------------------------------------------ *
 * pages
 * ------------------------------------------------------------------ */

/** One editable docs page. */
export interface PageEntry {
  /** Repo path: `docs/pages/opsec/travel/overview.mdx`. */
  path: string
  /** Path below `docs/pages/`: `opsec/travel/overview.mdx`. */
  rel: string
  /** Top-level folder — the framework the page belongs to. */
  framework: string
  /** Folders between the framework and the file. */
  subdir: string[]
  /** File name without its extension. */
  name: string
}

export interface FrameworkGroup {
  framework: string
  pages: PageEntry[]
}

/** A run of pages sharing a subfolder, for the picker. */
export interface PageSegment {
  key: string
  label: string
  pages: PageEntry[]
}

/* ------------------------------------------------------------------ *
 * frontmatter and contributors
 * ------------------------------------------------------------------ */

/** One `contributors:` entry in a page's frontmatter: a role and the handles
 *  credited under it. */
export interface ContributorGroup {
  /** `wrote` | `reviewed` | `fact-checked` — rendered via ROLE_ALIASES. */
  role?: string
  users?: string[]
}

/** Parsed YAML frontmatter. Open-ended: the wizard reads a few keys and
 *  preserves the rest untouched. */
export interface Frontmatter {
  title?: string
  description?: string
  tags?: string[]
  contributors?: ContributorGroup[]
  [key: string]: unknown
}

export interface Badge {
  name?: string
  /** Present on `Framework-Steward` badges: the framework being looked after. */
  framework?: string
  [key: string]: unknown
}

export interface ContributorRecord {
  name?: string
  avatar?: string
  github?: string
  company?: string
  badges?: Badge[]
  [key: string]: unknown
}

/** `contributors.json`, keyed by GitHub handle. */
export type ContributorDirectory = Record<string, ContributorRecord>

/** A contributor resolved for display: always has a name and an avatar. */
export interface Person {
  slug: string
  name: string
  avatar: string
}

/* ------------------------------------------------------------------ *
 * auth
 * ------------------------------------------------------------------ */

/** What `/api/auth/me` returns — public identity only, never a token. */
export interface AuthUser {
  authenticated: boolean
  login?: string
  name?: string | null
  avatar?: string | null
}

export type AuthStatus = 'loading' | 'in' | 'out' | 'unavailable'

export interface AuthState {
  status: AuthStatus
  user?: AuthUser
  refresh: () => Promise<void>
  signOut: () => Promise<void>
}
