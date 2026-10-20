import { useEffect, useState } from 'react'
import LinkPopover from './LinkPopover.js'
import type { ChainedCommands, Editor } from '@tiptap/react'
import type { ReactNode } from 'react'
import {
  BoldIcon,
  ItalicIcon,
  LinkIcon,
  ListIcon,
  OrderedListIcon,
  QuoteIcon,
} from './toolbarIcons.js'

// Formatting controls for whichever section currently has the cursor. A single
// shared toolbar (rather than one per section) keeps the page calm and matches
// what people expect from a word processor.
export default function Toolbar({ editor }: { editor: Editor | null }) {
  // A section that has been reset or scrolled out of the block list leaves its
  // editor destroyed behind it; driving that would throw.
  const live = editor && !editor.isDestroyed ? editor : null

  // The toolbar lives outside the editor it drives, so nothing here re-renders
  // when the cursor moves — the buttons would keep showing whatever was true at
  // the moment the section was clicked. Subscribing to the editor's transactions
  // keeps "this text is bold" honest as you move through a paragraph.
  useTransactions(live)

  // The link panel belongs to the section that had the cursor when it opened.
  // Clicking into another paragraph while it is up would leave it editing a
  // selection that has moved out from under it.
  const [linkOpen, setLinkOpen] = useState(false)
  useEffect(() => setLinkOpen(false), [live])

  const on = (name: string, attrs?: Record<string, unknown>) =>
    live?.isActive(name, attrs) ?? false
  const disabled = !live
  const run = (fn: (c: ChainedCommands) => ChainedCommands) => () =>
    live && fn(live.chain().focus()).run()

  return (
    <div className="flex flex-wrap items-center gap-1 border-b border-fw-border bg-fw-surface-2/40 px-3 py-2">
      <Group>
        <Btn label="Bold" active={on('bold')} disabled={disabled} onClick={run((c) => c.toggleBold())}>
          <BoldIcon />
        </Btn>
        <Btn label="Italic" active={on('italic')} disabled={disabled} onClick={run((c) => c.toggleItalic())}>
          <ItalicIcon />
        </Btn>
        <div className="relative" data-link-control>
          <Btn
            label={on('link') ? 'Edit link' : 'Link'}
            active={on('link') || linkOpen}
            disabled={disabled}
            onClick={() => setLinkOpen((o) => !o)}
          >
            <LinkIcon />
          </Btn>
          {linkOpen && live && (
            <LinkPopover editor={live} onClose={() => setLinkOpen(false)} />
          )}
        </div>
      </Group>

      <Divider />

      <Group>
        <Btn
          label="Heading"
          active={on('heading', { level: 2 })}
          disabled={disabled}
          onClick={run((c) => c.toggleHeading({ level: 2 }))}
        >
          <span className="text-[13px] font-bold">H2</span>
        </Btn>
        <Btn
          label="Subheading"
          active={on('heading', { level: 3 })}
          disabled={disabled}
          onClick={run((c) => c.toggleHeading({ level: 3 }))}
        >
          <span className="text-[13px] font-bold">H3</span>
        </Btn>
      </Group>

      <Divider />

      <Group>
        <Btn
          label="Bulleted list"
          active={on('bulletList')}
          disabled={disabled}
          onClick={run((c) => c.toggleBulletList())}
        >
          <ListIcon />
        </Btn>
        <Btn
          label="Numbered list"
          active={on('orderedList')}
          disabled={disabled}
          onClick={run((c) => c.toggleOrderedList())}
        >
          <OrderedListIcon />
        </Btn>
        <Btn
          label="Quote"
          active={on('blockquote')}
          disabled={disabled}
          onClick={run((c) => c.toggleBlockquote())}
        >
          <QuoteIcon />
        </Btn>
      </Group>

      <span className="ml-auto hidden text-[11px] text-fw-faint sm:block">
        {disabled ? 'Click any paragraph to start editing' : 'Editing'}
      </span>
    </div>
  )
}

// Re-render on every editor transaction, so the active states above follow the
// cursor rather than the last click.
function useTransactions(editor: Editor | null) {
  const [, bump] = useState(0)
  useEffect(() => {
    if (!editor) return
    const onTx = () => bump((n) => n + 1)
    editor.on('transaction', onTx)
    return () => {
      editor.off('transaction', onTx)
    }
  }, [editor])
}

const Group = ({ children }: { children: ReactNode }) => (
  <div className="flex items-center gap-0.5">{children}</div>
)
const Divider = () => <span className="mx-1 h-5 w-px bg-fw-border" />

function Btn({
  label,
  active,
  disabled,
  onClick,
  children,
}: {
  label: string
  active: boolean
  disabled: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      // Keep the cursor in the document — losing the selection would make the
      // command apply to nothing.
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={`flex h-8 min-w-8 items-center justify-center rounded-md px-1.5 transition-colors disabled:opacity-30 ${
        active
          ? 'bg-brand text-white'
          : 'text-fw-muted hover:bg-fw-surface-2 hover:text-fw-text'
      }`}
    >
      {children}
    </button>
  )
}
