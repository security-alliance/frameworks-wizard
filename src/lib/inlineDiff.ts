import { diffLines, diffWordsWithSpace } from 'diff'
import { unwrapMarkdown } from './markdown.js'
import type { Block } from './types.js'

// Turn edited blocks into markdown annotated with <ins>/<del> so the Review step
// can show changes *inside the rendered page*, where a non-technical contributor
// can actually judge them — rather than as a red/green line diff.
//
// Both sides are unwrapped to one line per markdown block before diffing. The
// docs are hard-wrapped at 120 columns and the editor re-wraps whatever it
// serializes, so a one-word fix shifts every following line of the paragraph.
// Compared line by line that reads as "these six lines were replaced by these
// six", and the whole section lights up. Compared block by block it is what it
// actually is: one word. Wrapping is a property of the source file, and this
// output is only ever rendered — the text committed to the branch comes from
// `joinBlocks`, which is untouched by any of this.
//
// The hard constraint: the markers are injected into markdown, so they must never
// land somewhere that breaks parsing. Three rules keep that true:
//   1. Only the text *after* a line's structural prefix (`## `, `- `, `> `) is
//      ever wrapped, so headings and list items keep working.
//   2. Table rows are never annotated — a `|` row can't carry inline HTML.
//   3. Fenced code is never annotated either, because markdown doesn't parse
//      anything inside a fence: an <ins> put there renders as the literal text
//      `<ins class="fw-ins">`, which is what a contributor adding a line to a
//      shell snippet would see. Changed code lines are reported out of band
//      instead, on a marker line ahead of the fence, and `segmentBody` turns
//      that into a code block the preview renders itself.

const PREFIX_RE = /^(\s*(?:#{1,6}\s+|[-*+]\s+|\d+\.\s+|>\s?)*)([\s\S]*)$/
const FENCE_RE = /^\s*(`{3,}|~{3,})/

export const CODE_MARKS_RE = /^<!--fw-code(?:\s+ins=([\d,]*))?(?:\s+del=([\d,]*))?-->$/

const esc = (s: string) => s.replace(/</g, '&lt;')

/** What happened to one line of the annotated result. */
type Mark = 'ins' | 'del' | null

interface Row {
  text: string
  mark: Mark
  /** Set when this line replaced another: the line it replaced, for word-diffing. */
  from?: string
}

export interface AnnotatedPage {
  body: string
  changedBlocks: number
}

/**
 * @param blocks blocks from splitBlocks, some marked edited
 */
export function annotateBlocks(blocks: Block[]): AnnotatedPage {
  let changedBlocks = 0

  const body = blocks
    .map((b) => {
      if (!b.edited || b.text + b.trail === b.raw) return b.raw
      changedBlocks++
      // Prose and the page title read as prose. Everything else doesn't:
      // annotating a checklist's source would show the contributor `- [x]`
      // markers they never typed.
      if (b.kind !== 'prose' && b.kind !== 'title') return b.text + b.trail
      return annotate(stripTrail(b.raw), b.text) + b.trail
    })
    .join('\n')

  return { body, changedBlocks }
}

const stripTrail = (s: string) => s.replace(/\s+$/, '')

function annotate(original: string, edited: string): string {
  return render(diffRows(unwrapMarkdown(original), unwrapMarkdown(edited)))
}

/* ------------------------------------------------------------------ *
 * 1. diff -> rows
 *
 * One row per line of the result, carrying what happened to it. Marking is
 * deferred to `render`, which is the only place that knows whether a line is
 * inside a code fence.
 * ------------------------------------------------------------------ */

function diffRows(original: string, edited: string): Row[] {
  const parts = diffLines(original, edited)
  const rows: Row[] = []

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]
    const next = parts[i + 1]

    // A removal immediately followed by an addition is a rewrite — pair the two
    // chunks off line by line so only the words that actually moved light up.
    if (part.removed && next?.added) {
      rows.push(...rewriteRows(toLines(part.value), toLines(next.value)))
      i++
      continue
    }
    const mark: Mark = part.removed ? 'del' : part.added ? 'ins' : null
    rows.push(...toLines(part.value).map((text) => ({ text, mark })))
  }
  return rows
}

// Each pair is one paragraph (or heading, or list item) against its
// replacement, which is the granularity word-diffing stays readable at. Anything
// left unpaired — a paragraph added or dropped outright — is marked whole,
// because there is nothing to diff it against.
function rewriteRows(before: string[], after: string[]): Row[] {
  const rows: Row[] = []
  const paired = Math.min(before.length, after.length)
  for (let i = 0; i < paired; i++) {
    rows.push(
      before[i] === after[i]
        ? { text: after[i], mark: null }
        : { text: after[i], mark: 'ins', from: before[i] },
    )
  }
  for (let i = paired; i < before.length; i++) rows.push({ text: before[i], mark: 'del' })
  for (let i = paired; i < after.length; i++) rows.push({ text: after[i], mark: 'ins' })
  return rows
}

// diffLines hands back chunks of whole lines, each ending in a newline except
// possibly the last. Dropping that trailing empty makes the rows of every chunk
// concatenate back to the original when nothing changed.
function toLines(value: string): string[] {
  const lines = value.split('\n')
  if (lines[lines.length - 1] === '') lines.pop()
  return lines
}

/* ------------------------------------------------------------------ *
 * 2. rows -> markdown
 * ------------------------------------------------------------------ */

function render(rows: Row[]): string {
  const out: string[] = []
  let fence: string | null = null
  let openedAt = -1 // index in `out` of the fence's opening line
  let lineNo = 0 // 1-based line number within the fence body
  let ins: number[] = []
  let del: number[] = []

  for (const row of rows) {
    const f = row.text.match(FENCE_RE)

    if (fence) {
      const closes = f && f[1][0] === fence[0] && f[1].length >= fence.length
      if (closes) {
        // Stamp the marks ahead of the block, where markdown can't swallow them.
        if (ins.length || del.length) out.splice(openedAt, 0, codeMarks(ins, del))
        fence = null
        ins = []
        del = []
      } else {
        lineNo++
        if (row.mark === 'ins') ins.push(lineNo)
        else if (row.mark === 'del') del.push(lineNo)
      }
      out.push(row.text) // never HTML inside a fence
      continue
    }

    if (f) {
      fence = f[1]
      openedAt = out.length
      lineNo = 0
      out.push(row.text)
      continue
    }

    out.push(markup(row))
  }

  // An unterminated fence: keep the marks rather than lose them.
  if (fence && (ins.length || del.length)) out.splice(openedAt, 0, codeMarks(ins, del))

  return out.join('\n')
}

const codeMarks = (ins: number[], del: number[]) =>
  `<!--fw-code${ins.length ? ` ins=${ins.join(',')}` : ''}${del.length ? ` del=${del.join(',')}` : ''}-->`

function markup(row: Row): string {
  if (!row.mark) return row.text
  if (row.from !== undefined) return rewriteLine(row.from, row.text)
  return markLine(row.text, row.mark)
}

function rewriteLine(before: string, after: string): string {
  if (unsafe(before) || unsafe(after)) return markLine(after, 'ins')

  // Inline code is protected the same way fenced code is, and for the same
  // reason: markdown parses nothing between backticks, so a <del> landing inside
  // `Cargo.toml` renders as the literal tag. Each span becomes one opaque token,
  // which also makes it diff as a unit — changing `Cargo.toml` to `Cargo.lock`
  // marks the whole reference rather than splicing the tag in after "Cargo.".
  const sentinel = uniqueSentinel(before, after)
  const spans: string[] = []
  const b = protectSpans(before, spans, sentinel)
  const a = protectSpans(after, spans, sentinel)

  const words = diffWordsWithSpace(b, a)
  // Skip past the structural prefix so `## ` never ends up inside a tag.
  let pending = a.match(PREFIX_RE)![1].length
  const pieces: string[] = []

  for (const w of words) {
    let value = w.value
    if (pending > 0) {
      const take = Math.min(pending, value.length)
      pieces.push(value.slice(0, take))
      value = value.slice(take)
      pending -= take
      if (!value) continue
    }
    if (w.added) pieces.push(`<ins class="fw-ins">${esc(value)}</ins>`)
    else if (w.removed) pieces.push(`<del class="fw-del">${esc(value)}</del>`)
    else pieces.push(value)
  }
  // Restore after escaping: the span's own text is code, and markdown does not
  // decode entities inside a code span, so escaping it would show `&lt;` to the
  // reader. Its content can't be parsed as HTML from in there either.
  return restoreSpans(pieces.join(''), spans, sentinel)
}

// Backtick runs, shortest match, so `a` and `b` in one line stay separate.
const CODE_SPAN_RE = /(`+)(?:(?!\1)[\s\S])*\1/g
// The token has to survive `diffWordsWithSpace`, which splits on word
// boundaries — anything punctuation-shaped gets torn into three tokens and the
// diff marks the number in the middle. All-word-character it is, grown until it
// appears in neither side, so a page that happens to contain the base string
// can't collide with it.
function uniqueSentinel(a: string, b: string): string {
  let s = 'FWCODESPAN'
  while (a.includes(s) || b.includes(s)) s += 'X'
  return s
}

// `spans` is shared between the two sides of a diff, so an unchanged span gets
// the same token on both and compares equal.
function protectSpans(text: string, spans: string[], sentinel: string): string {
  return text.replace(CODE_SPAN_RE, (span) => {
    let i = spans.indexOf(span)
    if (i === -1) i = spans.push(span) - 1
    return `${sentinel}${i}X`
  })
}

const restoreSpans = (text: string, spans: string[], sentinel: string) =>
  text.replace(new RegExp(`${sentinel}(\\d+)X`, 'g'), (_, i: string) => spans[Number(i)])

function markLine(line: string, kind: 'ins' | 'del'): string {
  if (line.trim() === '' || unsafe(line)) return line
  const tag = kind === 'ins' ? 'ins' : 'del'
  const cls = kind === 'ins' ? 'fw-ins' : 'fw-del'
  const m = line.match(PREFIX_RE)!
  if (m[2] === '') return line // nothing but a marker
  return `${m[1]}<${tag} class="${cls}">${esc(m[2])}</${tag}>`
}

// Table rows can't carry inline HTML without breaking the table.
function unsafe(text: string): boolean {
  return text.split('\n').some((l) => /^\s*\|/.test(l))
}
