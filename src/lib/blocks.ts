// Split an MDX page body into editable blocks.
//
// This is the foundation the whole editor rests on. Two properties matter:
//
//   1. LOSSLESS. joinBlocks(splitBlocks(body)) === body, always. Every line of
//      the original lands in exactly one block, and blocks store their source
//      verbatim.
//   2. ONLY TOUCHED BLOCKS ARE RE-SERIALIZED. A block the contributor never
//      opened emits its original bytes. That is what keeps a one-word typo fix
//      from producing a page-wide diff, and it bounds the WYSIWYG's blast
//      radius to text the contributor deliberately changed.
//
// The classifier is deliberately conservative: anything it doesn't positively
// recognise becomes a read-only `raw` block rather than something the editor
// might rewrite.

import { keepUntouched, sameContent } from './markdown.js'
import type { Block, BlockKind } from './types.js'

export type { Block, BlockKind } from './types.js'

// Boilerplate every page carries. Contributors must never edit these — the
// tags and credits are generated from frontmatter.
const MANAGED_TAGS = new Set(['TagList', 'AttributionList', 'ContributeFooter'])

const MANAGED_LABELS: Record<string, string> = {
  import: 'Page setup',
  TagList: 'Topic tags',
  AttributionList: 'Contributor credits',
  ContributeFooter: 'Contribute footer',
}

// Components that wrap ordinary text. Their tags are kept exactly as written,
// and the text between them is split and edited like the rest of the page, with
// the same safety check. Locking the whole component, as the editor first did,
// locked a third of the docs' checklists and every FAQ answer, which is the
// text people most often want to change. The value is what the frame is called
// on screen.
export const FRAME_LABELS: Record<string, string> = {
  Checklist: 'Checklist',
  details: 'Collapsible section · opens on click',
  GovernanceChecklistItem: 'Governance checklist item',
  DevOnly: 'Draft-only section · not on the live site yet',
}

const FENCE_RE = /^\s*(`{3,}|~{3,})/
const HEADING_RE = /^\s{0,3}(#{1,6})\s+/
// A real MDX import, `import { X } from "…"` or `import "…"`, and not a sentence
// that happens to wrap onto a line starting with the word "import" ("import or
// use it. This is the primary…"), which was cut out of its paragraph and locked
// as page setup.
const IMPORT_RE =
  /^import\s+(?:type\s+)?(?:[\w$]+\s*,?\s*)?(?:\{[^}]*\}|\*\s+as\s+[\w$]+)?\s*(?:from\s*)?["']/
const TAG_OPEN_RE = /^\s{0,3}<([A-Za-z][\w.-]*)/
// `<br />` on a line of its own is spacing, not content: nothing to edit, and a
// lock pill for each one only cluttered the pages that use them.
const BR_LINE_RE = /^\s*<br\s*\/?>\s*$/
const SUMMARY_LINE_RE = /^\s*<summary>(.*)<\/summary>\s*$/
const COMMENT_START_RE = /^\s*\{\/\*/
const COMMENT_END_RE = /\*\/\}\s*$/

let uid = 0
const nextId = () => `b${++uid}`

/**
 * @param body page body, frontmatter already stripped
 * @returns blocks covering every line of `body`
 */
export function splitBlocks(body: string): Block[] {
  const blocks: Block[] = []
  splitLines(body.split('\n'), 0, undefined, blocks, { seenTitle: false })
  return blocks
}

/**
 * Split `lines` into `blocks`. `base` is the page line `lines[0]` sits on, and
 * `inside` the component they're wrapped in, if any; a frame's text goes
 * through here again, so frames nest.
 */
function splitLines(
  lines: string[],
  base: number,
  inside: string | undefined,
  blocks: Block[],
  state: { seenTitle: boolean },
): void {
  const push = (kind: BlockKind, slice: string[], at: number, frame?: string) =>
    blocks.push(makeBlock(kind, slice, base + at, inside, frame))

  let i = 0
  let prose: string[] = [] // buffered prose lines awaiting a flush
  let proseStart = 0

  // Blank lines between sections are their own `spacer` block rather than part
  // of the prose that follows. They carry no content, so the editor renders
  // nothing for them — otherwise every gap in the source would become an empty
  // paragraph box, and the editing surface would look mostly empty.
  // Splitting a line run across two adjacent blocks stays lossless: the blocks
  // are rejoined with '\n', exactly the separator that was split on.
  function flushProse() {
    if (prose.length === 0) return
    let lead = 0
    while (lead < prose.length && prose[lead].trim() === '') lead++
    if (lead > 0) push('spacer', prose.slice(0, lead), proseStart)
    if (lead < prose.length) push('prose', prose.slice(lead), proseStart + lead)
    prose = []
  }

  function startProse(idx: number) {
    if (prose.length === 0) proseStart = idx
  }

  while (i < lines.length) {
    const line = lines[i]

    // --- Fenced code: swallow verbatim into prose. Critically, nothing inside
    // a fence is classified. Real pages have Solidity `import {Test} from …`
    // and raw <html>/<script> examples in fences that would otherwise be
    // mistaken for page scaffolding. ---
    const fence = line.match(FENCE_RE)
    if (fence) {
      const marker = fence[1]
      startProse(i)
      prose.push(line)
      i++
      while (i < lines.length) {
        prose.push(lines[i])
        const close = lines[i].match(FENCE_RE)
        // A closing fence uses the same character and is at least as long.
        if (close && close[1][0] === marker[0] && close[1].length >= marker.length) {
          i++
          break
        }
        i++
      }
      continue
    }

    // --- Import statements: page scaffolding, never contributor content. ---
    if (IMPORT_RE.test(line)) {
      flushProse()
      const { end } = scanManagedRun(lines, i)
      push('managed', lines.slice(i, end), i)
      i = end
      continue
    }

    // --- The page title: one H1, editable as plain text. ---
    const heading = line.match(HEADING_RE)
    if (heading && heading[1].length === 1 && !state.seenTitle) {
      flushProse()
      state.seenTitle = true
      push('title', [line], i)
      i++
      continue
    }

    // --- Section headings start a new prose block, so each block is one
    // section — a natural edit unit, and fine-grained enough that editing
    // "Key risks" doesn't re-serialize the rest of the page. ---
    if (heading && prose.length > 0) {
      flushProse()
      startProse(i)
      prose.push(line)
      i++
      continue
    }

    // --- An MDX comment on lines of its own (`{/* separator */}`). It never
    // shows on the site, and in the editor it read as text a contributor could
    // edit or delete, so it's set aside, untouched and out of sight. ---
    if (COMMENT_START_RE.test(line)) {
      let end = i
      while (end < lines.length && !lines[end].includes('*/}')) end++
      if (end < lines.length && COMMENT_END_RE.test(lines[end])) {
        flushProse()
        push('comment', lines.slice(i, end + 1), i)
        i = end + 1
        continue
      }
    }

    if (BR_LINE_RE.test(line)) {
      flushProse()
      push('spacer', [line], i)
      i++
      continue
    }

    // --- A line starting with a JSX/HTML tag. (Inline <br/> mid-paragraph is
    // untouched — this only fires at the start of a line.) ---
    const tag = line.match(TAG_OPEN_RE)
    if (tag) {
      const name = tag[1]

      if (MANAGED_TAGS.has(name)) {
        flushProse()
        const { end } = scanManagedRun(lines, i)
        push('managed', lines.slice(i, end), i)
        i = end
        continue
      }

      const end = findElementEnd(lines, i, name)
      if (end !== -1) {
        flushProse()
        const open = frameOpenLength(lines, i, end, name)
        if (open) {
          push('frameOpen', lines.slice(i, i + open), i, name)
          const inner = lines.slice(i + open, end - 1)
          splitLines(inner, base + i + open, name, blocks, state)
          push('frameClose', [lines[end - 1]], end - 1, name)
        } else {
          push('raw', lines.slice(i, end), i)
        }
        i = end
        continue
      }
      // Unbalanced tag — don't guess, let it ride as prose.
    }

    startProse(i)
    prose.push(line)
    i++
  }

  flushProse()
}

/**
 * How many lines open the frame starting at `start`, or 0 when this element
 * isn't one: not a wrapping component, an opening tag that spans lines, or a
 * closing tag that shares its line with text. Those stay locked, whole. A
 * `<details>` takes its `<summary>` line with it, so the question sits in the
 * frame's header rather than in the text.
 */
function frameOpenLength(lines: string[], start: number, end: number, name: string): number {
  if (!(name in FRAME_LABELS)) return 0
  const openRe = new RegExp(`^\\s{0,3}<${name}(\\s[^<>]*)?>\\s*$`)
  const closeRe = new RegExp(`^\\s*</${name}>\\s*$`)
  if (end - start < 2 || !openRe.test(lines[start]) || !closeRe.test(lines[end - 1])) return 0
  const open = name === 'details' && SUMMARY_LINE_RE.test(lines[start + 1] ?? '') ? 2 : 1
  return start + open <= end - 1 ? open : 0
}

/** Reassemble a page body from blocks, emitting original bytes where untouched. */
export function joinBlocks(blocks: Block[]): string {
  return blocks.map((b) => (b.edited ? b.text + b.trail : b.raw)).join('\n')
}

/**
 * Replace a block's content. Returns a new blocks array.
 *
 * A block is only marked edited when the new text differs from the original in
 * *content*, not merely in line shape. That matters twice over:
 *
 *   - TipTap round-trips a paragraph as one long line, which `wrapMarkdown` then
 *     re-wraps. Any editor lifecycle that replays a block's own content — a
 *     remount, a reset — would otherwise land here with bytes that differ from
 *     the source only in where the newlines fall, and the wizard would report
 *     sections as changed that nobody touched. "Undo all changes" would look
 *     like it hadn't worked: the reset is real, but the remounted editors would
 *     immediately re-register themselves as edits.
 *   - A contributor who types a word and deletes it again is back to no change,
 *     and the block goes back to emitting its original bytes.
 *
 * The same holds inside a block that did change: its untouched paragraphs keep
 * their original bytes (see `keepUntouched`), so the pull request shows what
 * the contributor wrote and nothing the editor merely re-wrapped.
 */
export function updateBlock(blocks: Block[], id: string, text: string): Block[] {
  return blocks.map((b) => {
    if (b.id !== id) return b
    const next = text.replace(/\s+$/, '')
    if (sameContent(next, b.raw)) return { ...b, text: b.pristine, edited: false }
    return { ...b, text: keepUntouched(b.pristine, next), edited: true }
  })
}

// The page's import of the docs components, which every page has for its tags
// and credits: `import { TagList, AttributionList, ContributeFooter } from '…/components'`.
const COMPONENTS_IMPORT_RE = /^(import\s*\{)([^}]*)(\}\s*from\s*['"][^'"]*components['"];?)/m
const IMPORTS_CHECKLIST_RE = /^import\s*\{[^}]*\bChecklist\b[^}]*\}/m
const CHECKLIST_OPEN_RE = /^\s{0,3}<Checklist\s/m

/**
 * Keep the page's import of `Checklist` in step with the checklists the
 * contributor added: a page using the component without importing it doesn't
 * build. Added to the import the page already has while a new checklist is
 * there, and taken out again with the last one, so undoing leaves no trace.
 * Pages that already use the component are left alone.
 */
export function syncChecklistImport(blocks: Block[]): Block[] {
  const setup = blocks.find((b) => b.kind === 'managed' && COMPONENTS_IMPORT_RE.test(b.pristine))
  if (!setup) return blocks
  const hasIt =
    blocks.some((b) => b.kind === 'managed' && IMPORTS_CHECKLIST_RE.test(b.pristine)) ||
    blocks.some((b) => b.kind === 'frameOpen' && b.frame === 'Checklist')
  if (hasIt) return blocks
  const needed = blocks.some((b) => b.kind === 'prose' && b.edited && CHECKLIST_OPEN_RE.test(b.text))
  const text = needed
    ? setup.pristine.replace(
        COMPONENTS_IMPORT_RE,
        (_, open: string, names: string, close: string) => `${open}${names.replace(/\s*,?\s*$/, '')}, Checklist ${close}`,
      )
    : setup.pristine
  if (text === setup.text) return blocks
  return blocks.map((b) => (b === setup ? { ...b, text, edited: needed } : b))
}

/** True once any block differs from the source page. */
export function isDirty(blocks: Block[]): boolean {
  return blocks.some((b) => b.edited && b.text + b.trail !== b.raw)
}

/* ------------------------------------------------------------------ *
 * a frame's one-line field: a <details> question, a governance item's title
 * ------------------------------------------------------------------ */

const TITLE_ATTR_RE = /\btitle="([^"]*)"/

export interface FrameField {
  label: string
  value: string
}

/**
 * The plain-text field a frame's opening tag carries, if it has one the
 * contributor can safely edit. Text that already holds markup or an MDX
 * expression is left alone: a plain text box would show it as code.
 */
export function frameField(block: Block): FrameField | null {
  if (block.kind !== 'frameOpen') return null
  if (block.frame === 'details') {
    const m = block.text.split('\n')[1]?.match(SUMMARY_LINE_RE)
    if (!m || /[<>{}]|&\w+;/.test(m[1])) return null
    return { label: 'Question', value: m[1] }
  }
  if (block.frame === 'GovernanceChecklistItem') {
    const m = block.text.match(TITLE_ATTR_RE)
    if (!m || /[{}]|&\w+;/.test(m[1])) return null
    return { label: 'Title', value: m[1] }
  }
  return null
}

/**
 * The frame's opening tag with its field set to `value`. Characters that would
 * end the field early or start markup are swapped for what reads the same: a
 * `"` would close the title attribute, and in a summary `<` opens a tag and `{`
 * an MDX expression.
 */
export function withFrameField(block: Block, value: string): string {
  const clean = value.replace(/[\r\n]+/g, ' ')
  if (block.frame === 'details') {
    const safe = clean.replace(/</g, '‹').replace(/>/g, '›').replace(/[{}]/g, '')
    const lines = block.pristine.split('\n')
    lines[1] = lines[1].replace(SUMMARY_LINE_RE, (whole, old: string) =>
      whole.replace(`<summary>${old}</summary>`, `<summary>${safe}</summary>`),
    )
    return lines.join('\n')
  }
  const safe = clean.replace(/"/g, '”').replace(/[{}]/g, '')
  return block.pristine.replace(TITLE_ATTR_RE, () => `title="${safe}"`)
}

/* ------------------------------------------------------------------ *
 * internals
 * ------------------------------------------------------------------ */

// Consecutive scaffolding lines (imports, <TagList/>, <AttributionList/>)
// collapse into one block, blank lines included, so the contributor sees a
// single "managed" card rather than three.
function scanManagedRun(lines: string[], start: number): { end: number } {
  let end = start
  let lastContent = start
  while (end < lines.length) {
    const line = lines[end]
    if (line.trim() === '') {
      end++
      continue
    }
    const tag = line.match(TAG_OPEN_RE)
    const isManaged = IMPORT_RE.test(line) || (tag && MANAGED_TAGS.has(tag[1]))
    if (!isManaged) break
    end++
    lastContent = end
  }
  // Don't swallow blank lines past the last managed line — they belong to
  // whatever follows.
  return { end: lastContent }
}

// Find the line after an element that starts at `start`. Handles single-line
// self-closing tags, single-line open+close, and multi-line containers with
// nesting. Returns -1 if it never closes.
function findElementEnd(lines: string[], start: number, name: string): number {
  const first = lines[start]

  if (/\/>\s*$/.test(first) && !first.includes(`</${name}`)) return start + 1
  if (first.includes(`</${name}>`)) return start + 1

  const open = new RegExp(`<${name}[\\s/>]`, 'g')
  const close = new RegExp(`</${name}>`, 'g')
  let depth = 0

  for (let i = start; i < lines.length; i++) {
    // A tag inside inline code is a mention, not a tag: a checklist item that
    // says "use the `<Checklist>` component" would otherwise open a second one
    // that never closes, and the whole component fell back to locked text.
    const line = lines[i].replace(/`[^`\n]*`/g, '')
    depth += (line.match(open) || []).length
    depth -= (line.match(close) || []).length
    if (depth <= 0) return i + 1
  }
  return -1
}

/** Human label for a managed block, derived from what it actually contains. */
export function managedLabel(block: Block): string {
  const found: string[] = []
  for (const line of block.text.split('\n')) {
    if (IMPORT_RE.test(line)) found.push(MANAGED_LABELS.import)
    const tag = line.match(TAG_OPEN_RE)
    if (tag && MANAGED_LABELS[tag[1]]) found.push(MANAGED_LABELS[tag[1]])
  }
  return [...new Set(found)].join(' · ') || 'Page setup'
}

/** Human label for a read-only raw block. */
export function rawLabel(block: Block): string {
  const tag = block.text.match(TAG_OPEN_RE)
  const name = tag ? tag[1] : 'content'
  const friendly: Record<string, string> = {
    details: 'Collapsible section',
    Checklist: 'Checklist',
    GovernanceChecklistItem: 'Governance checklist',
    DevOnly: 'Draft-only section',
    CertList: 'Certification list',
    TagProvider: 'Tag browser',
    TagFilter: 'Tag filter',
    div: 'Custom layout',
    img: 'Image',
    video: 'Video',
  }
  return friendly[name] || `${name} block`
}

function makeBlock(
  kind: BlockKind,
  lines: string[],
  startLine: number,
  inside?: string,
  frame?: string,
): Block {
  // Peel trailing blank lines off the content but keep them in `trail`, so an
  // edited block preserves the exact spacing that followed it.
  let k = 0
  while (k < lines.length && lines[lines.length - 1 - k].trim() === '') k++
  const content = lines.slice(0, lines.length - k)
  const raw = lines.join('\n')
  const text = content.join('\n')
  return {
    id: nextId(),
    kind,
    startLine,
    raw,
    text,
    // The source text, kept so a block that gets edited back to its original
    // content can return to emitting the original bytes.
    pristine: text,
    // Taking the remainder of `raw` (rather than counting newlines) keeps
    // text + trail === raw exact even when a block is nothing but blank lines,
    // where the separator count doesn't line up.
    trail: raw.slice(text.length),
    edited: false,
    ...(frame ? { frame } : {}),
    ...(inside ? { inside } : {}),
  }
}
