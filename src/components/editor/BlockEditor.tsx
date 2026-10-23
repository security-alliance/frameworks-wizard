import ProseBlock from './ProseBlock.js'
import ChecklistBlock from './ChecklistBlock.js'
import LockedBlock from './LockedBlock.js'
import type { Editor } from '@tiptap/react'
import type { Block } from '../../lib/types.js'

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
}: {
  blocks: Block[]
  /** The page's hard-wrap width, from `wrapWidth`. */
  wrap: number
  onChangeBlock: (id: string, text: string) => void
  /** Focus mode. The measure grows with the card, so the column doesn't sit in
   *  the middle of a wider box with new gutters on either side of it. */
  focus: boolean
  onFocusEditor: (editor: Editor) => void
}) {
  return (
    <div
      className={`mx-auto w-full space-y-4 px-5 py-8 transition-[max-width] duration-300 ease-out motion-reduce:transition-none sm:px-8 ${
        focus ? 'max-w-216' : 'max-w-3xl'
      }`}
    >
      {blocks.map((block) => {
        switch (block.kind) {
          // Blank lines in the source. They exist in the block list so the page
          // rejoins byte-for-byte, but there is nothing to show.
          case 'spacer':
            return null
          case 'title':
            return <TitleBlock key={block.id} block={block} onChange={onChangeBlock} />
          case 'prose':
            return (
              <ProseBlock
                key={block.id}
                block={block}
                wrap={wrap}
                onChange={onChangeBlock}
                onFocusEditor={onFocusEditor}
              />
            )
          case 'checklist':
            return (
              <ChecklistBlock key={block.id} block={block} onChange={onChangeBlock} />
            )
          case 'managed':
          case 'raw':
            return <LockedBlock key={block.id} block={block} />
        }
      })}
    </div>
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
  return (
    <input
      value={value}
      onChange={(e) => onChange(block.id, `# ${e.target.value}`)}
      aria-label="Page title"
      className="w-full rounded-lg border border-transparent bg-transparent px-2 py-1 text-3xl font-bold tracking-tight text-fw-strong hover:border-fw-border focus:border-brand focus:outline-none"
    />
  )
}
