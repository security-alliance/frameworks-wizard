import { updateBlock } from './blocks.js'
import type { PrAnswers } from './prTemplate.js'
import type { Block } from './types.js'

// Work in progress, kept in this browser.
//
// A reload, a crash or a misplaced ⌘R shouldn't cost anyone their writing, and
// that needs neither an account nor a server: the draft belongs to the person
// who typed it, and their own browser is the nearest place to put it. It is
// deliberately not gated behind signing in; not losing your work shouldn't be
// the price of a login.
//
// WHAT IS STORED, AND WHY IT ISN'T THE PAGE
//
// Not the finished body. `joinBlocks` emits drafted text for edited blocks, so
// re-splitting it would give blocks whose `raw` is the draft: nothing would
// look edited and the diff would come up empty.
//
// So only the edits are stored, each against the `startLine` of its section.
// Block ids can't identify the section: they come from a counter that restarts
// with the module, so the same page splits to `b1…bN` on one load and `b48…` on
// the next.
//
// Each edit also carries the section's original text. If the page has since
// changed on `develop`, the section at that line may not be the one that was
// edited, and dropping a paragraph into the wrong place is worse than admitting
// a draft didn't survive. Edits whose original no longer matches are skipped
// and counted, never guessed at.

const PREFIX = 'fw-draft:'
/** Drafts older than this are cleared the next time drafts are touched. */
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000

interface DraftEdit {
  /** Where the section started in the page this was drafted against. */
  line: number
  /** What that section said before it was edited. */
  was: string
  /** What the contributor wrote. */
  text: string
}

export interface Draft {
  savedAt: number
  edits: DraftEdit[]
  /**
   * What the contributor wrote on the Send step about their change.
   *
   * It rides along with the edits rather than living in its own key, because it
   * describes them: it is about this page, and a note restored onto somebody
   * else's page would be worse than no note at all.
   */
  note?: string
  /**
   * The Send step's ticks, for the same reason. They also have to survive
   * signing in again and the one-time setup, which leave the wizard for GitHub
   * and come back with a fresh page load.
   */
  answers?: PrAnswers
}

const key = (path: string) => `${PREFIX}${path}`

/** The blocks a contributor has actually changed. */
const editedBlocks = (blocks: Block[]) =>
  blocks.filter((b) => b.edited && b.text + b.trail !== b.raw)

/**
 * Write the current edits for `path`, or clear the draft when there are none —
 * undoing every change should not leave a ghost to be offered back later.
 */
export function saveDraft(
  path: string,
  blocks: Block[],
  note = '',
  answers: PrAnswers = {},
): boolean {
  const edits = editedBlocks(blocks).map((b) => ({
    line: b.startLine,
    was: b.pristine,
    text: b.text,
  }))

  // No edits, no draft — and the note goes with them. A note describing changes
  // that no longer exist has nothing left to describe, and keeping one would
  // put a draft with nothing in it in the drafts menu.
  if (edits.length === 0) {
    clearDraft(path)
    return true
  }

  try {
    localStorage.setItem(
      key(path),
      JSON.stringify({ savedAt: Date.now(), edits, note, answers } satisfies Draft),
    )
    return true
  } catch {
    // Quota, or storage disabled — private browsing being the common one. The
    // edit is still on screen and still sendable; it just won't survive a
    // reload. The caller is told so it can show the "are you sure" on closing
    // the tab for exactly these people.
    return false
  }
}

export function readDraft(path: string): Draft | null {
  try {
    const raw = localStorage.getItem(key(path))
    if (!raw) return null
    const d = JSON.parse(raw) as Draft
    if (!Array.isArray(d?.edits) || d.edits.length === 0) return null
    if (Date.now() - d.savedAt > MAX_AGE_MS) {
      clearDraft(path)
      return null
    }
    return d
  } catch {
    return null
  }
}

export function clearDraft(path: string): void {
  try {
    localStorage.removeItem(key(path))
  } catch {
    /* nothing to do */
  }
}

export interface DraftSummary {
  path: string
  savedAt: number
  edits: number
}

/** Every page with a draft waiting, newest first. */
export function listDrafts(): DraftSummary[] {
  const out: DraftSummary[] = []
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (!k?.startsWith(PREFIX)) continue
      const path = k.slice(PREFIX.length)
      const d = readDraft(path)
      if (d) out.push({ path, savedAt: d.savedAt, edits: d.edits.length })
    }
  } catch {
    return []
  }
  return out.sort((a, b) => b.savedAt - a.savedAt)
}

/** Drop anything past `MAX_AGE_MS`. `readDraft` does the expiring. */
export function pruneDrafts(): void {
  listDrafts()
}

/**
 * Lay a draft back over freshly loaded blocks.
 *
 * `blocks` must be the page as it came from the repo, so each block keeps the
 * original bytes in `raw` and the diff stays truthful.
 */
export function applyDraft(
  blocks: Block[],
  draft: Draft,
): { blocks: Block[]; applied: number; skipped: number } {
  let next = blocks
  let applied = 0
  let skipped = 0

  for (const edit of draft.edits) {
    const target = next.find(
      (b) => b.startLine === edit.line && b.pristine === edit.was,
    )
    if (!target) {
      skipped++
      continue
    }
    next = updateBlock(next, target.id, edit.text)
    applied++
  }

  return { blocks: next, applied, skipped }
}
