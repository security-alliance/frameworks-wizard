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
// A list marker followed by nothing is an empty list item ("1." on its own, the
// blanks of a template), so it starts a block too.
const BLOCK_START_RE =
  /^\s*(?:#{1,6}\s|[-*+](?:\s|$)|\d+[.)](?:\s|$)|\||<|={3,}\s*$|-{3,}\s*$|\*{3,}\s*$|_{3,}\s*$)/

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
  // Inside a list any number starts the next item; outside one only `1.` can
  // interrupt a paragraph. A list ends at text at the left margin after a
  // blank line, the same rule as `listShape`.
  let inList = false
  let sawBlank = false
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
      sawBlank = true
      out.push({ depth, text: '', atomic: true })
      continue
    }

    const prev = out[out.length - 1]
    const joins =
      prev &&
      !prev.atomic &&
      prev.depth === depth &&
      (!BLOCK_START_RE.test(rest) || (!inList && continuesParagraph(rest))) &&
      // Two trailing spaces are a markdown hard line break — a real one.
      !/ {2}$/.test(prev.text)

    if (!joins && LIST_ITEM_RE.test(rest)) inList = true
    else if (sawBlank && !/^\s/.test(line)) inList = false
    sawBlank = false
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

// `<br>` is fine in HTML and in markdown but not in MDX, which reads it as a tag
// that never closes and stops building the page. The editor writes table-cell
// line breaks as `<br>`, so they're written back the way the docs write them.
const tidyEscapes = (md: string): string =>
  mapProseLines(md, (line) =>
    line
      .replace(REDUNDANT_ESCAPE_RE, '$1')
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, '&')
      .replace(/<br\s*>/g, '<br />'),
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
  const norm = compareForm
  // `norm` trims every line, so on its own it can't see nesting: a sub-item
  // moved up a level, or a note under a checklist item moved out from under it,
  // read as the same text. The list shape is compared separately, by level
  // rather than by spaces, since the docs indent sub-items by 2, 3 or 4.
  return norm(a) === norm(b) && listShape(a) === listShape(b)
}

/** The text `sameContent` compares: `md` with line shape and equivalent
 *  spellings folded away. */
function compareForm(s: string): string {
  return (
    blankRows(unwrapMarkdown(listSpacing(lazyQuotes(codeFences(tableDividers(openCodeSpans(hardBreaks(pipeLines(s)))))))))
      // `_italic_` and `*italic*` are the same italic; the docs use both (69 and
      // 113 times) and the editor writes `*`. A `_` inside a word isn't
      // italics, so `snake_case` is left alone.
      .replace(/(?<![\w*_\\])_(?!\s)([^_\n]+?)(?<!\s)_(?![\w_])/g, '*$1*')
      // Bold around a link and bold inside it are the same bold link; the
      // editor writes it inside.
      .replace(/\*\*\[([^\]\n]+)\]\(([^)\n]+)\)\*\*/g, '[**$1**]($2)')
      // `*` and `+` bullets are the same list as `-`, which the editor writes.
      .replace(/^([ \t>]*)[*+](?=\s)/gm, '$1-')
      // `1)` and `1.` are the same numbered list; the editor writes `1.`.
      .replace(/^([ \t>]*\d+)\)(?=\s)/gm, '$1.')
      // `<br>` and `<br />` are the same line break; `toSourceMarkdown` makes
      // sure the editor's own output is always the `<br />` MDX accepts.
      .replace(/<br\s*\/?>/g, '<br />')
      .replace(/&gt;/g, '>')
      .replace(/&lt;/g, '<')
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, '&')
      // Backslash escapes, a backslash itself included: `\\` and a stray `\`
      // both show one backslash.
      .replace(/\\([^A-Za-z0-9\s])/g, '$1')
      .replace(/[ \t\u00a0]+/g, ' ')
      .trim()
  )
}

// A line that starts with `|` is a table row only when it follows another row
// or has a divider row under it. Otherwise it's a paragraph's text carrying on
// ("…mobile phones, etc)⏎| [it.cornell.edu](…)"), and the editor joins it to
// the line above. Its `|` is escaped here so it carries on in the comparison
// too; the escape is folded away again with the others.
function pipeLines(md: string): string {
  const lines = md.split('\n')
  return lines
    .map((line, i) => {
      const m = line.match(/^(\s*(?:>\s?)*)\|/)
      if (!m) return line
      const prev = (lines[i - 1] ?? '').replace(/^[\s>]*/, '')
      const next = lines[i + 1] ?? ''
      const inTable = prev.startsWith('|') || (next.includes('|') && TABLE_DIVIDER_RE.test(next))
      return inTable || prev === '' ? line : m[1] + '\\|' + line.slice(m[0].length)
    })
    .join('\n')
}

// A line break inside a paragraph is written either as two trailing spaces or
// as a trailing `\`; the editor writes the second. Both are folded into the
// first, which `unwrapMarkdown` already keeps as a break.
const hardBreaks = (md: string): string => md.replace(/(?<!\\)\\$/gm, '  ')

// An inline code span can wrap onto the next line (`git config user.signingkey
// <FINGERPRINT>`). Line by line, that next line looks like it starts a tag, so
// the span is put back on one line before anything else.
function openCodeSpans(md: string): string {
  const out: string[] = []
  let fence: string | null = null
  for (const line of md.split('\n')) {
    const f = line.match(FENCE_RE)
    if (fence || f) {
      if (f) fence = fence && f[1][0] === fence[0] && f[1].length >= fence.length ? null : (fence ?? f[1])
      out.push(line)
      continue
    }
    const prev = out[out.length - 1]
    const open = prev !== undefined && ((prev.match(/`/g) || []).length % 2 === 1)
    if (open && line.trim() !== '') out[out.length - 1] = prev + ' ' + line.trim()
    else out.push(line)
  }
  return out.join('\n')
}

/**
 * After unwrapping, every paragraph is one row, so a blank row only says where
 * one block ends, which the rows already say: "Message template:" followed
 * straight by a quote and the editor's blank line between them are the same
 * page. Blank rows inside code are kept, since there they're content. Empty
 * quote rows (`>`) still separate a quote's paragraphs, so only the ones at a
 * quote's start or end, and repeats, are dropped.
 */
function blankRows(md: string): string {
  const rows = md.split('\n')
  const out: string[] = []
  let fence: string | null = null
  const quoteText = (r: string | undefined) => r !== undefined && /^>+\s*\S/.test(r) && !/^>+$/.test(r.trim())
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]
    const f = r.match(FENCE_RE)
    if (fence) {
      if (f && f[1][0] === fence[0] && f[1].length >= fence.length) fence = null
      out.push(r)
      continue
    }
    if (f) {
      fence = f[1]
      out.push(r)
      continue
    }
    if (r.trim() === '') continue
    if (/^>+$/.test(r.trim())) {
      let j = i + 1
      while (j < rows.length && (rows[j].trim() === '' || /^>+$/.test(rows[j].trim()))) j++
      if (!quoteText(out[out.length - 1]) || !quoteText(rows[j])) continue
      if (/^>+$/.test((out[out.length - 1] ?? '').trim())) continue
    }
    out.push(r)
  }
  return out.join('\n')
}

// A code fence's length is only there to be longer than any run of backticks
// inside the code: ```` and ``` around the same code are the same block. The
// editor writes the shortest fence that still works, so the code inside never
// ends the block early.
const codeFences = (md: string): string =>
  md.replace(/^([ \t>]*)(`{3,}|~{3,})/gm, (_m, lead: string, f: string) => lead + f[0].repeat(3))

// A table's divider row, `| ---- | :---: |`.
const TABLE_DIVIDER_RE = /^\s*\|?\s*:?-+:?\s*(?:\|\s*:?-+:?\s*)*\|?\s*$/

// How many dashes a table's divider row has is layout, like the spaces that
// line the columns up: `| ---- | ------- |` and `| --- | --- |` are the same
// table, and the editor writes the second. Comparing them literally locked
// every section with a table whose author padded the divider, along with the
// rest of the section. The `:` alignment marks are kept: those change the table.
const tableDividers = (md: string): string =>
  md
    .split('\n')
    .map((l) => (l.includes('|') && l.includes('-') && TABLE_DIVIDER_RE.test(l) ? l.replace(/-+/g, '-').replace(/\s+/g, '') : l))
    .join('\n')

/**
 * A quote's paragraph may carry on onto lines without the `>`, which markdown
 * reads as still inside the quote; the editor writes the `>` on every line.
 * Those lines get their `>` here, so the two read the same.
 */
function lazyQuotes(md: string): string {
  let depth = 0
  return md
    .split('\n')
    .map((line) => {
      const q = peelQuote(line)
      if (q.depth > 0) {
        depth = q.rest.trim() === '' ? 0 : q.depth
        return line
      }
      if (depth > 0 && line.trim() !== '' && !BLOCK_START_RE.test(line)) {
        return '>'.repeat(depth) + ' ' + line.trim()
      }
      depth = 0
      return line
    })
    .join('\n')
}

/**
 * One blank line anywhere inside a list makes the whole list "loose" (spaced
 * items), and the editor then writes a blank line between every item. Both
 * render the same, so blank lines inside a list are folded into one marker per
 * list: a spaced list still never reads the same as a tight one.
 */
function listSpacing(md: string): string {
  const lines = md.split('\n')
  const out: string[] = []
  let inList = false
  let loose = false
  const isItem = (l: string) => LIST_ITEM_RE.test(peelQuote(l).rest)
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (isItem(line)) {
      inList = true
      out.push(line)
      continue
    }
    if (line.trim() === '' && inList) {
      let j = i + 1
      while (j < lines.length && lines[j].trim() === '') j++
      const next = lines[j]
      if (next !== undefined && (isItem(next) || /^\s+\S/.test(next))) {
        loose = true
        i = j - 1
        continue
      }
      if (loose) out.push('<!--loose list-->')
      inList = false
      loose = false
    }
    out.push(line)
  }
  if (inList && loose) out.push('<!--loose list-->')
  return out.join('\n')
}

/** A numbered line that markdown reads as the paragraph above carrying on, when
 *  it comes straight after paragraph text: only `1.` may start a list there. */
const continuesParagraph = (line: string): boolean => {
  const m = line.match(/^\s*(\d+)[.)](?:\s|$)/)
  return !!m && m[1] !== '1'
}

const LIST_ITEM_RE = /^(\s*)(?:[-*+]|\d+[.)])(?:\s|$)/

/**
 * Each list item's nesting level, in order: `0,1,1,0` for an item with two
 * sub-items and a sibling. Levels come from a stack of the indents seen so
 * far, so `- a` / `    - b` and `- a` / `  - b` are the same shape. Text at
 * the left margin after a blank line ends the list; straight after an item it
 * is that item's text wrapping onto the next line, which markdown allows.
 */
function listShape(md: string): string {
  const levels: number[] = []
  const stack: number[] = []
  let fence: string | null = null
  let afterBlank = false
  let prevLine = ''
  for (const line of md.split('\n')) {
    const blank = line.trim() === ''
    const wasBlank = afterBlank
    afterBlank = blank
    const f = line.match(FENCE_RE)
    if (fence) {
      if (f && f[1][0] === fence[0] && f[1].length >= fence.length) fence = null
      continue
    }
    if (f) {
      fence = f[1]
      continue
    }
    const { rest } = peelQuote(line)
    const item = rest.match(LIST_ITEM_RE)
    // A number other than 1 straight after paragraph text carries the text on
    // ("…compared to⏎2023. Research…"); it only starts an item inside a list.
    const plainBefore = prevLine.trim() !== '' && !LIST_ITEM_RE.test(prevLine)
    prevLine = rest
    if (item && plainBefore && !stack.length && continuesParagraph(rest)) continue
    if (!item) {
      // Indentation is read on the line as written: a quote indented under an
      // item (`   > Note`) is inside the item, not the end of the list.
      if (!blank && wasBlank && !/^\s/.test(line)) stack.length = 0
      continue
    }
    const width = item[1].replace(/\t/g, '    ').length
    while (stack.length && stack[stack.length - 1] > width) stack.pop()
    if (!stack.length || stack[stack.length - 1] < width) stack.push(width)
    levels.push(stack.length - 1)
  }
  return levels.join(',')
}

/**
 * The indentation every non-blank line of `md` shares. Text inside a component
 * is sometimes indented as a whole (`<Checklist>` then `    - [ ] \u2026`), which MDX
 * reads as plain text but standard markdown, and so the editor, reads as a
 * code block once it reaches four spaces.
 */
export function commonIndent(md: string): string {
  let common: string | null = null
  for (const line of md.split('\n')) {
    if (line.trim() === '') continue
    const lead = line.match(/^[ \t]*/)![0]
    if (common === null || !lead.startsWith(common)) {
      let n = 0
      const c: string = common ?? lead
      while (n < c.length && n < lead.length && c[n] === lead[n]) n++
      common = c.slice(0, n)
    }
    if (common === '') return ''
  }
  return common ?? ''
}

/** `md` without `indent` at the start of each line. */
export const dedent = (md: string, indent: string): string =>
  indent ? md.split('\n').map((l) => (l.startsWith(indent) ? l.slice(indent.length) : l)).join('\n') : md

/** `md` with `indent` put back at the start of each non-blank line. */
export const reindent = (md: string, indent: string): string =>
  indent ? md.split('\n').map((l) => (l.trim() === '' ? l : indent + l)).join('\n') : md

/**
 * Pull list items that are indented far deeper than their parent's text back to
 * that text's column, so the editor reads the nesting the site shows.
 *
 * MDX turns off indented code blocks, so a sub-item indented twenty spaces
 * under an item at eight (twitter.mdx) is simply that item's sub-item on the
 * site. Standard markdown, which the editor follows, reads anything more than
 * three columns past the parent's text as not a new item, and glued the note
 * onto the item's text instead. Only what the editor reads changes: the safety
 * check still compares its output with the page as written.
 */
export function mdxIndents(md: string): string {
  const items: { indent: number; content: number }[] = []
  let shift = 0
  let shiftFrom = Infinity
  let fence: string | null = null
  return md
    .split('\n')
    .map((raw) => {
      let line = raw
      const lead = (l: string) => (l.match(/^ */) ?? [''])[0].length
      if (shift && line.trim() !== '' && lead(line) >= shiftFrom) line = line.slice(shift)
      else if (shift && line.trim() !== '') {
        shift = 0
        shiftFrom = Infinity
      }
      const f = line.match(FENCE_RE)
      if (fence) {
        if (f && f[1][0] === fence[0] && f[1].length >= fence.length) fence = null
        return line
      }
      if (f) {
        fence = f[1]
        return line
      }
      if (line.trim() === '') return line
      const ind = lead(line)
      const m = line.match(/^( *)([-*+]|\d+[.)])( +)/)
      if (!m) {
        if (ind === 0) items.length = 0
        return line
      }
      while (items.length && items[items.length - 1].indent >= ind) items.pop()
      const parent = items[items.length - 1]
      let at = ind
      if (parent && ind > parent.content + 3) {
        at = parent.content
        shift = ind - at
        shiftFrom = ind
        line = line.slice(shift)
      }
      items.push({ indent: at, content: at + m[2].length + Math.min(m[3].length, 4) })
      return line
    })
    .join('\n')
}
