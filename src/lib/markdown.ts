import { diffArrays } from 'diff'

// Markdown line-shape utilities shared by the editor, the block model and the
// round-trip safety gate.
//
// Everything here exists because of one mismatch: the docs are hard-wrapped to
// ~120 columns, and TipTap serializes each paragraph as a single long line.
// That difference is pure line-shape — it changes no content — so it must not
// be mistaken for either an unsafe block or a contributor's edit.

// The repo's hard-wrap width. Measured, not guessed: across docs/pages the 90th
// percentile line is 116 chars and the 95th is 119, so 120 is the house style.
// About one page in twelve is wrapped narrower, though, so a page's own width
// is measured by `wrapWidth`, and this is the fallback and the ceiling.
const WRAP_AT = 120

const FENCE_RE = /^\s*(`{3,}|~{3,})/
const QUOTE_RE = /^[ \t]*((?:>[ \t]?)+)/
// Lines that begin a new markdown block rather than continuing the previous one.
const BLOCK_START_RE =
  /^\s*(?:#{1,6}\s|[-*+]\s|\d+[.)]\s|\||<|={3,}\s*$|-{3,}\s*$|\*{3,}\s*$|_{3,}\s*$)/

/**
 * Re-wrap serialized markdown to the repo's hard-wrap width.
 *
 * TipTap emits one long line per paragraph. Without this, editing a single word
 * would rewrite the paragraph as one enormous line and make the change
 * unreadable to the maintainer reviewing it.
 */
export function wrapMarkdown(md: string, width: number = WRAP_AT): string {
  const lines = md.split('\n')
  const out: string[] = []
  let fence: string | null = null

  for (const line of lines) {
    const f = line.match(FENCE_RE)
    if (f) {
      fence = fence && f[1][0] === fence[0] ? null : fence || f[1]
      out.push(line)
      continue
    }
    // Never reflow code, tables, or anything already short enough.
    if (fence || line.length <= width || /^\s*\|/.test(line) || /^ {4,}\S/.test(line)) {
      out.push(line)
      continue
    }

    // Preserve list markers and blockquote prefixes; continuation lines line up
    // under the text, not the marker.
    const m = line.match(/^(\s*(?:[-*+]\s+|\d+\.\s+|>\s?)?)([\s\S]*)$/)!
    const prefix = m[1]
    const hanging = /^\s*$/.test(prefix)
      ? prefix
      : prefix.startsWith('>')
        ? prefix
        : ' '.repeat(prefix.length)

    out.push(...wrapWords(m[2], width, prefix, hanging))
  }
  return out.join('\n')
}

// Words that start a list item, heading, blockquote, rule or JSX when they open
// a line, so a wrapped line must never begin with one: `-`, `+`, `*`, `#`…,
// `1.`, `1)`, `---`, `===`, or anything starting with `>` or `<`.
const LINE_START_SYNTAX_RE = /^(?:[-+*]|#{1,6}|\d+[.)]|[-=*_]{2,}|[<>].*)$/

function wrapWords(
  text: string,
  width: number,
  firstPrefix: string,
  contPrefix: string,
): string[] {
  const words = text.split(/\s+/).filter(Boolean)
  if (words.length === 0) return [firstPrefix + text]

  const rows: string[] = []
  let cur = firstPrefix
  let empty = true

  for (const word of words) {
    const candidate = empty ? cur + word : cur + ' ' + word
    // A single over-long word (usually a URL) is left to overflow rather than
    // broken, which would corrupt the link. So is a word that would mean
    // something else at the start of a line: "[Audit](…) - What to expect"
    // broken before the dash would publish a bullet point nobody wrote.
    if (!empty && candidate.length > width && !LINE_START_SYNTAX_RE.test(word)) {
      rows.push(cur)
      cur = contPrefix + word
    } else {
      cur = candidate
    }
    empty = false
  }
  rows.push(cur)
  return rows
}

/**
 * The width a page is hard-wrapped at, measured from its own lines.
 *
 * Re-wrapping a changed paragraph at the page's own width is what keeps the
 * lines before the change identical. A line counts when the next line carries
 * on the same paragraph, so someone chose to break it there, and when it holds
 * more than one word: a line that is a single over-long word (usually a URL)
 * overflows any width and says nothing about it. The widest such line is the
 * width. A page with none falls back to WRAP_AT, which is also the ceiling.
 */
export function wrapWidth(md: string): number {
  const lines = md.split('\n')
  let widest = 0
  let fence: string | null = null

  for (let i = 0; i < lines.length - 1; i++) {
    const line = lines[i]
    const f = line.match(FENCE_RE)
    if (fence) {
      if (f && f[1][0] === fence[0] && f[1].length >= fence.length) fence = null
      continue
    }
    if (f) {
      fence = f[1]
      continue
    }

    const here = peelQuote(line)
    const next = peelQuote(lines[i + 1])
    const continued =
      here.rest.trim() !== '' &&
      next.rest.trim() !== '' &&
      here.depth === next.depth &&
      !ATOMIC_RE.test(here.rest) &&
      !BLOCK_START_RE.test(next.rest) &&
      !FENCE_RE.test(next.rest) &&
      !/ {2}$/.test(line)
    const words = here.rest.replace(/^\s*(?:[-*+]\s+|\d+[.)]\s+)/, '').trim()
    if (continued && /\s/.test(words)) widest = Math.max(widest, line.length)
  }
  return widest ? Math.min(widest, WRAP_AT) : WRAP_AT
}

// Lines that are complete on their own: headings, table rows and JSX.
const ATOMIC_RE = /^\s*(?:#{1,6}\s|\||<)/

/**
 * Split markdown into the groups of lines that make up each paragraph, list
 * item, heading, table row or fenced block, and each run of blank lines.
 * Joining every group's lines with '\n' gives back the text exactly.
 */
function lineGroups(md: string): string[][] {
  const groups: string[][] = []
  let fence: string | null = null
  // The group the next line might continue.
  let open: { lines: string[]; depth: number; blank: boolean; atomic: boolean } | null = null

  for (const line of md.split('\n')) {
    const f = line.match(FENCE_RE)
    if (fence && open) {
      open.lines.push(line)
      if (f && f[1][0] === fence[0] && f[1].length >= fence.length) {
        fence = null
        open = null
      }
      continue
    }
    if (f) {
      fence = f[1]
      open = { lines: [line], depth: 0, blank: false, atomic: true }
      groups.push(open.lines)
      continue
    }

    const { depth, rest } = peelQuote(line)
    const blank = rest.trim() === ''
    const continues =
      open !== null &&
      open.depth === depth &&
      (blank
        ? open.blank
        : !open.blank &&
          !open.atomic &&
          !BLOCK_START_RE.test(rest) &&
          // Two trailing spaces are a markdown hard line break — a real one.
          !/ {2}$/.test(open.lines[open.lines.length - 1]))
    if (continues && open) {
      open.lines.push(line)
      continue
    }
    open = { lines: [line], depth, blank, atomic: !blank && ATOMIC_RE.test(rest) }
    groups.push(open.lines)
  }
  return groups
}

/**
 * `next`, with every paragraph, list item and heading whose content didn't
 * change put back exactly as it was in `original`.
 *
 * The editor hands back a whole section at a time, re-serialized, so every
 * paragraph in it comes back re-wrapped, the untouched ones included. On a page
 * wrapped narrower than the editor wraps, a one-word edit turned into a diff of
 * every paragraph around it, burying the actual change. Content is compared
 * with `sameContent`, the same test that decides whether a section changed at
 * all, so the result always says exactly what the editor said.
 */
export function keepUntouched(original: string, next: string): string {
  const was = lineGroups(original)
  const now = lineGroups(next)
  const join = (g: string[]) => g.join('\n')

  const out: string[][] = []
  let w = 0
  let n = 0
  for (const change of diffArrays(was.map(join), now.map(join), { comparator: sameContent })) {
    if (change.removed) {
      w += change.count
    } else if (change.added) {
      out.push(...now.slice(n, n + change.count))
      n += change.count
    } else {
      out.push(...was.slice(w, w + change.count))
      w += change.count
      n += change.count
    }
  }
  return out.map(join).join('\n')
}

/** One markdown block mid-unwrap: `atomic` lines never absorb the next line. */
interface UnwrapRow {
  depth: number
  text: string
  atomic: boolean
}

/**
 * Collapse hard-wrapped lines back into one line per markdown block.
 *
 * The inverse of `wrapMarkdown`, and the reason blockquotes are editable at all:
 * a wrapped blockquote repeats its `> ` marker on every line, so plain
 * whitespace normalisation leaves a stray `>` in the middle of the text and
 * every `> 🔑 **Key Takeaway**` on the site would look like content the editor
 * had mangled. Quote depth is kept, so a blockquote never compares equal to the same
 * words outside one.
 */
export function unwrapMarkdown(md: string): string {
  const out: UnwrapRow[] = []
  let fence: string | null = null

  for (const line of md.split('\n')) {
    const f = line.match(FENCE_RE)
    // Code fences are copied through untouched, and nothing merges across them.
    if (fence) {
      out.push({ depth: 0, text: line, atomic: true })
      if (f && f[1][0] === fence[0] && f[1].length >= fence.length) fence = null
      continue
    }
    if (f) {
      fence = f[1]
      out.push({ depth: 0, text: line, atomic: true })
      continue
    }

    const { depth, rest } = peelQuote(line)
    if (rest.trim() === '') {
      out.push({ depth, text: '', atomic: true })
      continue
    }

    const prev = out[out.length - 1]
    const joins =
      prev &&
      !prev.atomic &&
      prev.depth === depth &&
      !BLOCK_START_RE.test(rest) &&
      // Two trailing spaces are a markdown hard line break — a real one.
      !/ {2}$/.test(prev.text)

    if (joins) prev.text += ' ' + rest.trim()
    else out.push({ depth, text: rest.trim(), atomic: false })
  }

  return out
    .map((o) => (o.depth ? '>'.repeat(o.depth) + (o.text ? ' ' + o.text : '') : o.text))
    .join('\n')
}

/**
 * Serialize editor markdown the way the docs are actually written.
 *
 * TipTap escapes on the way out for a generic markdown target: a literal `>`
 * comes back as `&gt;`, and `*`, `[`, `]`, `_`, `~` come back backslashed. None
 * of that is wrong, and all of it renders identically — but the repo writes
 * these plainly (428 pages contain no `\*`, `\[` or `\_` at all, and one single
 * `&gt;`), so leaving them in would spray a contributor's paragraph with
 * punctuation they never typed.
 *
 * `width` is the page's own, from `wrapWidth`.
 */
export function toSourceMarkdown(md: string, width: number = WRAP_AT): string {
  return plainAngles(wrapMarkdown(tidyEscapes(md), width))
}

// Escapes that mean nothing where TipTap puts them.
const REDUNDANT_ESCAPE_RE = /\\([*_[\]~])/g

const tidyEscapes = (md: string): string =>
  mapProseLines(md, (line) =>
    line.replace(REDUNDANT_ESCAPE_RE, '$1').replace(/&quot;/g, '"').replace(/&amp;/g, '&'),
  )

// `>` is only a blockquote marker at the start of a line. Anywhere else — "Settings
// > Face ID", which the docs are full of — it is an ordinary character, so it is
// written as one. Run after wrapping, since wrapping is what decides where a
// line starts.
const plainAngles = (md: string): string =>
  mapProseLines(md, (line) => {
    const m = line.match(/^(\s*(?:>\s?)*)([\s\S]*)$/)!
    const rest = m[2].startsWith('&gt;')
      ? '&gt;' + m[2].slice(4).replace(/&gt;/g, '>')
      : m[2].replace(/&gt;/g, '>')
    return m[1] + rest
  })

// Apply `fn` to every line outside a fenced code block. Fenced content is code,
// where a backslash is a backslash and nothing here should touch it.
function mapProseLines(md: string, fn: (line: string) => string): string {
  let fence: string | null = null
  return md
    .split('\n')
    .map((line) => {
      const f = line.match(FENCE_RE)
      if (fence) {
        if (f && f[1][0] === fence[0] && f[1].length >= fence.length) fence = null
        return line
      }
      if (f) {
        fence = f[1]
        return line
      }
      return fn(line)
    })
    .join('\n')
}

function peelQuote(line: string): { depth: number; rest: string } {
  const m = line.match(QUOTE_RE)
  if (!m) return { depth: 0, rest: line }
  return { depth: (m[1].match(/>/g) || []).length, rest: line.slice(m[0].length) }
}

/**
 * Compare two markdown strings ignoring line-shape only.
 *
 * Two jobs, both of which need exactly this notion of "same":
 *   - the per-block safety gate — a block that doesn't survive a round trip
 *     through the editor with identical content never gets the visual editor;
 *   - deciding whether a contributor actually changed anything — re-wrapping a
 *     paragraph they didn't touch is not an edit.
 */
export function sameContent(a: string, b: string): boolean {
  // Blank lines are deliberately *not* collapsed: tight vs loose lists render
  // differently, so that difference is content, not line shape.
  //
  // Non-breaking spaces are folded in with ordinary ones. A handful of pages
  // carry stray U+00A0 mid-sentence, which the editor normalises on the way
  // out; treating an invisible character as a content change would lock those
  // sections for no reason a contributor could ever see.
  //
  // Escapes are folded for the same reason: `&gt;`, `\*`, and a plain `>` or `*`
  // all read as one character on the rendered page. Comparing them literally
  // would lock roughly one section in eight — including most of the travel guide,
  // which writes menu paths as "Settings > Face ID". `toSourceMarkdown` is what
  // keeps the written form plain; this is what stops the difference counting as
  // content.
  const norm = (s: string) =>
    unwrapMarkdown(s)
      .replace(/&gt;/g, '>')
      .replace(/&lt;/g, '<')
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, '&')
      .replace(/\\([^A-Za-z0-9\\s])/g, '$1')
      .replace(/[ \t\u00a0]+/g, ' ')
      .trim()
  return norm(a) === norm(b)
}
