import { useEffect, useState } from 'react'
import LinkPopover from './LinkPopover.js'
import CopyInstructions from './CopyInstructions.js'
import StyleMenu from './StyleMenu.js'
import Tooltip, { Keys } from './Tooltip.js'
import { shortcut } from '../../lib/format.js'
import type { ChainedCommands, Editor } from '@tiptap/react'
import type { ReactNode } from 'react'
import {
  BoldIcon,
  ChecklistIcon,
  HelpIcon,
  ItalicIcon,
  LinkIcon,
  ListIcon,
  OrderedListIcon,
  QuoteIcon,
} from './toolbarIcons.js'

// Formatting controls for whichever section currently has the cursor. A single
// shared toolbar (rather than one per section) keeps the page calm and matches
// what people expect from a word processor.
export default function Toolbar({
  editor,
  helpOpen,
  helpIds,
  onToggleHelp,
}: {
  editor: Editor | null
  helpOpen: boolean
  /** The help panel's ids, for `aria-controls`. */
  helpIds: string
  onToggleHelp: () => void
}) {
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
        <Btn
          label="Bold"
          hint={<><Keys>**text**</Keys>, or {shortcut('Mod-B')}</>}
          active={on('bold')}
          disabled={disabled}
          onClick={run((c) => c.toggleBold())}
        >
          <BoldIcon />
        </Btn>
        <Btn
          label="Italic"
          hint={<><Keys>*text*</Keys>, or {shortcut('Mod-I')}</>}
          active={on('italic')}
          disabled={disabled}
          onClick={run((c) => c.toggleItalic())}
        >
          <ItalicIcon />
        </Btn>
        <div className="relative" data-link-control>
          {/* No keyboard shortcut: the link extension doesn't register one. */}
          <Btn
            label={on('link') ? 'Edit link' : 'Link'}
            hint="Select text first"
            active={on('link') || linkOpen}
            disabled={disabled}
            quiet={linkOpen}
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

      <StyleMenu editor={live} />

      <Divider />

      <Group>
        <Btn
          label="Bulleted list"
          hint={<>Type <Keys>-</Keys> and a space, or {shortcut('Mod-Shift-8')}</>}
          active={on('bulletList')}
          disabled={disabled}
          onClick={run((c) => c.toggleBulletList())}
        >
          <ListIcon />
        </Btn>
        <Btn
          label="Numbered list"
          hint={<>Type <Keys>1.</Keys> and a space, or {shortcut('Mod-Shift-7')}</>}
          active={on('orderedList')}
          disabled={disabled}
          onClick={run((c) => c.toggleOrderedList())}
        >
          <OrderedListIcon />
        </Btn>
        <Btn
          label="Checklist"
          // ⌘⇧9 is the task list's own shortcut, which the checklist keeps.
          hint={<>Type <Keys>[ ]</Keys> and a space, or {shortcut('Mod-Shift-9')}</>}
          active={on('taskList') || on('numberedTaskList')}
          disabled={disabled}
          onClick={run((c) => c.toggleTaskList())}
        >
          <ChecklistIcon />
        </Btn>
        <Btn
          label="Quote"
          hint={<>Type <Keys>&gt;</Keys> and a space, or {shortcut('Mod-Shift-B')}</>}
          active={on('blockquote')}
          disabled={disabled}
          onClick={run((c) => c.toggleBlockquote())}
        >
          <QuoteIcon />
        </Btn>
      </Group>

      <div className="ml-auto flex items-center gap-2">
        <CopyInstructions editor={live} />
        <button
          type="button"
          onClick={onToggleHelp}
          aria-expanded={helpOpen}
          aria-controls={helpIds}
          className={`flex h-9 items-center gap-1.5 rounded-md border px-2.5 text-[0.7813rem] font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/60 ${
            helpOpen
              ? 'border-brand bg-brand-soft text-fw-strong'
              : 'border-fw-border text-fw-text hover:bg-fw-surface-2'
          }`}
        >
          <HelpIcon />
          Formatting help
        </button>
      </div>
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

// Inactive (no section has the cursor) is `aria-disabled`, not `disabled`: a
// disabled button gets no mouse events in some browsers, so its tooltip
// wouldn't show, and people can't learn the toolbar before clicking into the
// page. It stays readable, in the faint text colour rather than at 30%
// opacity, which was far below the contrast floor.
function Btn({
  label,
  hint,
  active,
  disabled,
  quiet,
  onClick,
  children,
}: {
  label: string
  /** How else to do it, for the tooltip. */
  hint?: ReactNode
  active: boolean
  disabled: boolean
  /** No tooltip, while the button's own panel is open under it. */
  quiet?: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <Tooltip name={label} hint={hint} off={quiet}>
      {(tip) => (
        <button
          {...tip}
          type="button"
          aria-label={label}
          aria-pressed={active}
          aria-disabled={disabled}
          // Keep the cursor in the document — losing the selection would make the
          // command apply to nothing.
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => !disabled && onClick()}
          className={`flex h-8 min-w-8 items-center justify-center rounded-md px-1.5 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/60 ${
            disabled
              ? 'cursor-default text-fw-faint'
              : active
                ? 'bg-brand text-white'
                : 'text-fw-muted hover:bg-fw-surface-2 hover:text-fw-text'
          }`}
        >
          {children}
        </button>
      )}
    </Tooltip>
  )
}
