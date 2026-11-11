import { useLayoutEffect, useRef } from 'react'
import ProseBlock from './ProseBlock.js'
import LockedBlock from './LockedBlock.js'
import { FRAME_LABELS, frameField, withFrameField } from '../../lib/blocks.js'
import type { ReactNode } from 'react'
import type { Editor } from '@tiptap/react'
import type { Block } from '../../lib/types.js'
import type { PageContext } from '../../lib/tiptapConfig.js'
import { headingsIn } from '../../lib/headings.js'

// The editing surface: the page as a document, one block per section.
//
// No scroll container of its own. The document is as tall as the document and
// the page carries it, so there's one scrollbar rather than two (see
// EditStep). Which section has the cursor is tracked up there too, since the
// toolbar it drives sits in the sticky header.
export default function BlockEditor({
  blocks,
  wrap,
  onChangeBlock,
  focus,
  onFocusEditor,
  intro,
}: {
  blocks: Block[]
  /** The page's hard-wrap width, from `wrapWidth`. */
  wrap: number
  /** Shown above the first section, in the same column. */
  intro?: ReactNode
  onChangeBlock: (id: string, text: string) => void
  /** Focus mode. The measure grows with the card, so the column doesn't sit in
   *  the middle of a wider box with new gutters on either side of it. */
  focus: boolean
  onFocusEditor: (editor: Editor) => void
}) {
  const contexts = pageContexts(blocks)
  const render = (nodes: Node[]) =>
    nodes.map((node, i) =>
      'frame' in node ? (
        <Frame
          key={node.frame.id}
          open={node.frame}
          underBullet={leadsIn(nodes[i - 1])}
          onChange={onChangeBlock}
        >
          {render(node.children)}
        </Frame>
      ) : (
        <BlockView
          key={node.block.id}
          block={node.block}
          wrap={wrap}
          context={contexts.get(node.block.id)!}
          onChange={onChangeBlock}
          onFocusEditor={onFocusEditor}
        />
      ),
    )

  return (
    <div
      className={`mx-auto w-full space-y-4 px-4 py-6 sm:py-8 transition-[max-width] duration-300 ease-out motion-reduce:transition-none sm:px-8 ${
        focus ? 'max-w-216' : 'max-w-3xl'
      }`}
    >
      {intro}
      {render(toTree(blocks))}
    </div>
  )
}

/** A block, or a frame holding the blocks between its tags. */
type Node = { block: Block } | { frame: Block; children: Node[] }

// The blocks come flat, in page order, so the page rejoins by concatenation.
// On screen a frame's text sits inside its box, so the flat list is folded
// into a tree at each `frameOpen`/`frameClose` pair. The closing tag itself has
// nothing to show.
function toTree(blocks: Block[]): Node[] {
  const root: Node[] = []
  const stack: Node[][] = [root]
  for (const block of blocks) {
    const level = stack[stack.length - 1]
    if (block.kind === 'frameOpen') {
      const node = { frame: block, children: [] as Node[] }
      level.push(node)
      stack.push(node.children)
    } else if (block.kind === 'frameClose') {
      if (stack.length > 1) stack.pop()
    } else {
      level.push({ block })
    }
  }
  return root
}

// A bullet straight above a component, with no blank line between, is its
// lead-in: "- Safety Setup > Moderation > Permissions:" and then the checklist of
// those permissions. The live site indents the component under the bullet, so
// the box is indented the same way here rather than reading as a new list.
function leadsIn(prev: Node | undefined): boolean {
  if (!prev || !('block' in prev)) return false
  const { block } = prev
  if (block.kind !== 'prose' || block.trail !== '') return false
  const last = block.text.split('\n').pop() ?? ''
  return /^\s*(?:[-*+]|\d+[.)])\s/.test(last)
}

// Components that are already a checklist: a list added inside one is part of
// it and needs no box of its own.
const CHECKLIST_FRAMES = new Set(['Checklist', 'GovernanceChecklistItem'])
const CHECKLIST_ID_RE = /<Checklist\s[^>]*\bid="([^"]+)"/g

/**
 * What each section needs to know about the page around it (see
 * `PageContext`): the heading above it, and the checklist ids used anywhere
 * else, from the page as it is now, edits included.
 */
function pageContexts(blocks: Block[]): Map<string, PageContext> {
  const ids = blocks.map((b) => [...b.text.matchAll(CHECKLIST_ID_RE)].map((m) => m[1]))
  const out = new Map<string, PageContext>()
  let headingAbove: PageContext['headingAbove'] = null
  blocks.forEach((b, i) => {
    out.set(b.id, {
      boxChecklists: !(b.inside && CHECKLIST_FRAMES.has(b.inside)),
      headingAbove,
      usedIds: ids.flatMap((list, j) => (j === i ? [] : list)),
    })
    if (b.kind === 'prose' || b.kind === 'title') {
      const hs = headingsIn(b.text)
      if (hs.length) headingAbove = hs[hs.length - 1]
    }
  })
  return out
}

function BlockView({
  block,
  wrap,
  context,
  onChange,
  onFocusEditor,
}: {
  block: Block
  wrap: number
  context: PageContext
  onChange: (id: string, text: string) => void
  onFocusEditor: (editor: Editor) => void
}) {
  switch (block.kind) {
    // Blank lines in the source. They exist in the block list so the page
    // rejoins byte-for-byte, but there is nothing to show.
    case 'spacer':
    // MDX comments: invisible on the site, so not shown here either.
    case 'comment':
    case 'frameOpen':
    case 'frameClose':
      return null
    case 'title':
      return <TitleBlock block={block} onChange={onChange} />
    case 'prose':
      return (
        <ProseBlock
          block={block}
          wrap={wrap}
          context={context}
          onChange={onChange}
          onFocusEditor={onFocusEditor}
        />
      )
    case 'managed':
    case 'raw':
      return <LockedBlock block={block} />
  }
}

// A component that wraps ordinary text, drawn as a labelled box around it. The
// tags never show; a <details> question or a governance item's title is a
// plain text field in the header, since it lives inside the tag, where bold or
// a link wouldn't survive.
function Frame({
  open,
  underBullet,
  onChange,
  children,
}: {
  open: Block
  underBullet: boolean
  onChange: (id: string, text: string) => void
  children: ReactNode
}) {
  const name = open.frame ?? ''
  const field = frameField(open)
  const draftOnly = name === 'DevOnly'
  return (
    <section
      aria-label={FRAME_LABELS[name] ?? name}
      className={`rounded-xl border bg-fw-surface-2/30 px-3 pb-2 pt-3 ${
        draftOnly ? 'border-dashed border-fw-border' : 'border-fw-border-soft'
      } ${underBullet ? 'ml-4 -mt-2 sm:ml-8' : ''}`}
    >
      <div className="mb-1 px-2 text-[0.6875rem] font-semibold uppercase tracking-wide text-fw-faint">
        {FRAME_LABELS[name] ?? name}
      </div>
      {field && (
        <label className="mb-1 block px-2">
          <span className="sr-only">{field.label}</span>
          <input
            value={field.value}
            onChange={(e) => onChange(open.id, withFrameField(open, e.target.value))}
            placeholder={field.label}
            className="w-full rounded-lg border border-transparent bg-transparent px-1.5 py-1 text-[0.9375rem] font-semibold text-fw-strong hover:border-fw-border focus:border-brand focus:outline-none"
          />
        </label>
      )}
      <div className="space-y-4">{children}</div>
    </section>
  )
}

// The page title, editable as plain text — the "# " marker stays out of sight.
function TitleBlock({
  block,
  onChange,
}: {
  block: Block
  onChange: (id: string, text: string) => void
}) {
  const value = block.text.replace(/^\s*#\s+/, '')
  // A textarea that grows with its text rather than an input: on a phone a
  // long title was cut off mid-word ("Front-End Web Applic"). It is still one
  // line in the file, so Enter is swallowed and pasted line breaks flattened.
  const ref = useRef<HTMLTextAreaElement>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const fit = () => {
      el.style.height = 'auto'
      el.style.height = `${el.scrollHeight}px`
    }
    fit()
    window.addEventListener('resize', fit)
    return () => window.removeEventListener('resize', fit)
  }, [value])
  return (
    <textarea
      ref={ref}
      rows={1}
      value={value}
      onChange={(e) => onChange(block.id, `# ${e.target.value.replace(/\s*\n\s*/g, ' ')}`)}
      onKeyDown={(e) => e.key === 'Enter' && e.preventDefault()}
      aria-label="Page title"
      className="block w-full resize-none overflow-hidden rounded-lg border border-transparent bg-transparent px-2 py-1 text-2xl leading-tight font-bold tracking-tight text-fw-strong hover:border-fw-border focus:border-brand focus:outline-none sm:text-3xl"
    />
  )
}
