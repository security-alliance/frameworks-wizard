// Segment an MDX body into an ordered list of preview blocks so the preview can
// render the real Vocs components (tags, attribution, footer) around the
// markdown — instead of stripping them out.
//
// Notes:
//   - `import` lines are dropped.
//   - <Checklist id="…"> wrappers are dropped but their inner markdown task
//     list is kept, so it renders as real checkboxes (it's author content).

import { CODE_MARKS_RE } from './inlineDiff.js'

/** Render as GitHub-flavored markdown. */
export interface MdSegment {
  type: 'md'
  text: string
}
/** `<TagList>` built from `frontmatter.tags`. */
export interface TagListSegment {
  type: 'taglist'
}
/** `<AttributionList>` built from `frontmatter.contributors`. */
export interface AttributionSegment {
  type: 'attribution'
}
/** `<ContributeFooter>`. */
export interface FooterSegment {
  type: 'footer'
}
/** A fenced block with changed lines to highlight, pulled out of the markdown
 *  because a fence can't carry inline markup. Line numbers are 1-based within
 *  the fence body. */
export interface CodeSegment {
  type: 'code'
  lang: string
  code: string
  ins: Set<number>
  del: Set<number>
}
/** A component the preview doesn't render yet — shown as a placeholder. */
export interface UnknownSegment {
  type: 'unknown'
  name: string
}

export type Segment =
  | MdSegment
  | TagListSegment
  | AttributionSegment
  | FooterSegment
  | CodeSegment
  | UnknownSegment

const IMPORT_RE = /^\s*import\s.+\sfrom\s.+$/
const FENCE_RE = /^\s*(`{3,}|~{3,})/
const numbers = (csv: string | undefined) =>
  new Set((csv ?? '').split(',').filter(Boolean).map(Number))
const CHECKLIST_OPEN_RE = /^\s*<Checklist\b/
const CHECKLIST_CLOSE_RE = /^\s*<\/Checklist>\s*$/
const KNOWN: Record<string, 'taglist' | 'attribution' | 'footer'> = {
  TagList: 'taglist',
  AttributionList: 'attribution',
  ContributeFooter: 'footer',
}
// A line that is entirely a single JSX element, e.g. `<TagList tags={…} />`.
const JSX_LINE_RE = /^\s*<\/?([A-Z][A-Za-z0-9]*)\b[^>]*\/?>\s*$/

export function segmentBody(body: string): Segment[] {
  const blocks: Segment[] = []
  let buffer: string[] = []

  const flush = () => {
    if (buffer.length) {
      const text = buffer.join('\n').trim()
      if (text) blocks.push({ type: 'md', text })
      buffer = []
    }
  }

  const lines = body.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    // A changed code block, flagged by the review step. Markdown can't carry a
    // highlight inside a fence, so the fence is pulled out here and the preview
    // renders it directly.
    const marks = CODE_MARKS_RE.exec(line)
    if (marks && FENCE_RE.test(lines[i + 1] ?? '')) {
      flush()
      const open = lines[++i]
      const fence = FENCE_RE.exec(open)![1]
      const code: string[] = []
      while (++i < lines.length) {
        const close = FENCE_RE.exec(lines[i])
        if (close && close[1][0] === fence[0] && close[1].length >= fence.length) break
        code.push(lines[i])
      }
      blocks.push({
        type: 'code',
        lang: open.slice(open.indexOf(fence) + fence.length).trim(),
        code: code.join('\n'),
        ins: numbers(marks[1]),
        del: numbers(marks[2]),
      })
      continue
    }

    if (IMPORT_RE.test(line)) continue
    if (CHECKLIST_OPEN_RE.test(line) || CHECKLIST_CLOSE_RE.test(line)) continue

    const jsx = JSX_LINE_RE.exec(line)
    if (jsx) {
      const name = jsx[1]
      if (KNOWN[name]) {
        flush()
        blocks.push({ type: KNOWN[name] })
        continue
      }
      // Unknown standalone component — placeholder so nothing looks broken.
      flush()
      blocks.push({ type: 'unknown', name })
      continue
    }

    buffer.push(line)
  }
  flush()
  return blocks
}
