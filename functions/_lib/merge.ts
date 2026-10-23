// Three-way merge of one text file, line by line, built on the `diff` package
// the frontend already uses for its diffs.
//
// Send uses it when the page in the contributor's copy isn't the version they
// started editing: their edit (`base` → `theirs`) is replayed onto the copy's
// version (`ours`). Changes from the two sides that touch the same or adjacent
// lines count as a conflict instead of being guessed at, the same rule git
// uses, so a merge here never produces something git itself wouldn't.

import { diffArrays } from 'diff'

/** One change to `base`: lines [start, end) replaced by `lines`. */
interface Hunk {
  start: number
  /** Equal to `start` for a pure insertion. */
  end: number
  lines: string[]
}

/** Lines with their line endings kept, so joining them gives back the text. */
function splitLines(text: string): string[] {
  return text.match(/[^\n]*\n|[^\n]+$/g) ?? []
}

function hunks(base: string[], other: string[]): Hunk[] {
  const out: Hunk[] = []
  let at = 0
  let open: Hunk | null = null
  for (const change of diffArrays(base, other)) {
    if (!change.added && !change.removed) {
      if (open) out.push(open)
      open = null
      at += change.count
      continue
    }
    open ??= { start: at, end: at, lines: [] }
    if (change.removed) {
      at += change.count
      open.end = at
    } else {
      open.lines.push(...change.value)
    }
  }
  if (open) out.push(open)
  return out
}

const sameHunk = (a: Hunk, b: Hunk) =>
  a.start === b.start &&
  a.end === b.end &&
  a.lines.length === b.lines.length &&
  a.lines.every((line, i) => line === b.lines[i])

/** `ours` with the change from `base` to `theirs` applied, or null on a conflict. */
export function merge3(ours: string, base: string, theirs: string): string | null {
  const lines = splitLines(base)
  const all = [...hunks(lines, splitLines(ours)), ...hunks(lines, splitLines(theirs))].sort(
    (a, b) => a.start - b.start || a.end - b.end,
  )

  const out: string[] = []
  let at = 0
  let prev: Hunk | null = null
  for (const h of all) {
    // Hunks from one side are always separated by an unchanged line, so
    // touching the previous hunk means the two sides met.
    if (prev && h.start <= prev.end) {
      if (sameHunk(h, prev)) continue // both made the identical change
      return null
    }
    out.push(...lines.slice(at, h.start), ...h.lines)
    at = h.end
    prev = h
  }
  out.push(...lines.slice(at))
  return out.join('')
}
