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
import type { Block, BlockKind, Checklist, ChecklistItem } from './types.js'

export type { Block, BlockKind, Checklist, ChecklistItem } from './types.js'

// Boilerplate every page carries. Contributors must never edit these — the
// tags and credits are generated from frontmatter.
const MANAGED_TAGS = new Set(['TagList', 'AttributionList', 'ContributeFooter'])

const MANAGED_LABELS: Record<string, string> = {
  import: 'Page setup',
  TagList: 'Topic tags',
  AttributionList: 'Contributor credits',
  ContributeFooter: 'Contribute footer',
}

const FENCE_RE = /^\s*(`{3,}|~{3,})/
const HEADING_RE = /^\s{0,3}(#{1,6})\s+/
const IMPORT_RE = /^import\s/
const TAG_OPEN_RE = /^\s{0,3}<([A-Za-z][\w.-]*)/
const TASK_ITEM_RE = /^\s*[-*+]\s+\[( |x|X)\]\s?(.*)$/

let uid = 0
const nextId = () => `b${++uid}`

/**
 * @param body page body, frontmatter already stripped
 * @returns blocks covering every line of `body`
 */
export function splitBlocks(body: string): Block[] {
  const lines = body.split('\n')
  const blocks: Block[] = []

  let i = 0
  let prose: string[] = [] // buffered prose lines awaiting a flush
  let proseStart = 0
  let seenTitle = false

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
    if (lead > 0) blocks.push(makeBlock('spacer', prose.slice(0, lead), proseStart))
    if (lead < prose.length) {
      blocks.push(makeBlock('prose', prose.slice(lead), proseStart + lead))
    }
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
      blocks.push(makeBlock('managed', lines.slice(i, end), i))
      i = end
      continue
    }

    // --- The page title: one H1, editable as plain text. ---
    const heading = line.match(HEADING_RE)
    if (heading && heading[1].length === 1 && !seenTitle) {
      flushProse()
      seenTitle = true
      blocks.push(makeBlock('title', [line], i))
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

    // --- A line starting with a JSX/HTML tag. (Inline <br/> mid-paragraph is
    // untouched — this only fires at the start of a line.) ---
    const tag = line.match(TAG_OPEN_RE)
    if (tag) {
      const name = tag[1]

      if (MANAGED_TAGS.has(name)) {
        flushProse()
        const { end } = scanManagedRun(lines, i)
        blocks.push(makeBlock('managed', lines.slice(i, end), i))
        i = end
        continue
      }

      const end = findElementEnd(lines, i, name)
      if (end !== -1) {
        flushProse()
        const slice = lines.slice(i, end)
        const kind: BlockKind =
          name === 'Checklist' && isPlainChecklist(slice) ? 'checklist' : 'raw'
        blocks.push(makeBlock(kind, slice, i))
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
  return blocks
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

/** True once any block differs from the source page. */
export function isDirty(blocks: Block[]): boolean {
  return blocks.some((b) => b.edited && b.text + b.trail !== b.raw)
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
    const line = lines[i]
    depth += (line.match(open) || []).length
    depth -= (line.match(close) || []).length
    if (depth <= 0) return i + 1
  }
  return -1
}

// A <Checklist> gets the friendly checkbox widget only if its body is purely a
// markdown task list. Anything richer (nested components, prose between items)
// falls back to a read-only raw block rather than risking a rewrite.
function isPlainChecklist(slice: string[]): boolean {
  const inner = slice.slice(1, -1)
  const meaningful = inner.filter((l) => l.trim() !== '')
  return meaningful.length > 0 && meaningful.every((l) => TASK_ITEM_RE.test(l))
}

/** Parse a checklist block into `{ id, items: [{ checked, text }] }`. */
export function parseChecklist(block: Block): Checklist {
  const lines = block.text.split('\n')
  const id = (lines[0].match(/\bid\s*=\s*"([^"]*)"/) || [])[1] ?? ''
  const items: ChecklistItem[] = []
  for (const line of lines.slice(1, -1)) {
    const m = line.match(TASK_ITEM_RE)
    if (m) items.push({ checked: m[1].toLowerCase() === 'x', text: m[2] })
  }
  return { id, items, openTag: lines[0], closeTag: lines[lines.length - 1] }
}

/** Serialize checklist items back to source, preserving the original tags. */
export function serializeChecklist({ openTag, closeTag, items }: Checklist): string {
  const body = items.map((it) => `- [${it.checked ? 'x' : ' '}] ${it.text}`)
  return [openTag, ...body, closeTag].join('\n')
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

function makeBlock(kind: BlockKind, lines: string[], startLine: number): Block {
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
  }
}
