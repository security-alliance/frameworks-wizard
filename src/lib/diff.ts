import { diffLines } from 'diff'

// Build GitHub-style unified-diff rows from the original vs edited body.
// Long runs of unchanged lines are collapsed into a "gap" marker so the
// contributor sees only what changed, with a few lines of context.

export interface AddRow {
  type: 'add'
  text: string
  newLn: number
}
export interface DelRow {
  type: 'del'
  text: string
  oldLn: number
}
export interface CtxRow {
  type: 'ctx'
  text: string
  oldLn: number
  newLn: number
}
/** N unchanged lines hidden between two changes. */
export interface GapRow {
  type: 'gap'
  count: number
}

export type DiffRow = AddRow | DelRow | CtxRow | GapRow
/** Rows with a line of text — everything except the collapsed-run marker. */
type LineRow = AddRow | DelRow | CtxRow

export interface DiffResult {
  rows: DiffRow[]
  changed: boolean
  added?: number
  removed?: number
}

export function computeDiffRows(
  original: string | null | undefined,
  edited: string | null | undefined,
  context = 3,
): DiffResult {
  const parts = diffLines(original ?? '', edited ?? '')

  // 1. Expand into per-line rows with old/new line numbers.
  const raw: LineRow[] = []
  let oldLn = 1
  let newLn = 1
  for (const part of parts) {
    const lines = part.value.split('\n')
    if (lines[lines.length - 1] === '') lines.pop() // drop trailing empty
    for (const text of lines) {
      if (part.added) raw.push({ type: 'add', text, newLn: newLn++ })
      else if (part.removed) raw.push({ type: 'del', text, oldLn: oldLn++ })
      else raw.push({ type: 'ctx', text, oldLn: oldLn++, newLn: newLn++ })
    }
  }

  const changed = raw.some((r) => r.type !== 'ctx')
  if (!changed) return { rows: [], changed: false }

  // 2. Collapse long unchanged runs, keeping `context` lines beside changes.
  const rows: DiffRow[] = []
  let i = 0
  while (i < raw.length) {
    if (raw[i].type !== 'ctx') {
      rows.push(raw[i++])
      continue
    }
    // Gather the full unchanged run.
    let j = i
    while (j < raw.length && raw[j].type === 'ctx') j++
    const run = raw.slice(i, j)
    const atStart = i === 0
    const atEnd = j === raw.length

    if (run.length <= context * 2 && !atStart && !atEnd) {
      rows.push(...run) // short interior run: keep all
    } else {
      const head = atStart ? [] : run.slice(0, context)
      const tail = atEnd ? [] : run.slice(-context)
      const hidden = run.length - head.length - tail.length
      rows.push(...head)
      if (hidden > 0) rows.push({ type: 'gap', count: hidden })
      rows.push(...tail)
    }
    i = j
  }

  const added = raw.filter((r) => r.type === 'add').length
  const removed = raw.filter((r) => r.type === 'del').length
  return { rows, changed: true, added, removed }
}
