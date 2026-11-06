import { useEffect, useId, useRef, useState } from 'react'
import { ChevronDown, PencilIcon, TrashIcon } from './ui.js'
import type { DraftSummary } from '../lib/drafts.js'

// Unfinished work, from anywhere in the wizard.
//
// A draft announced only on the editor, for the page you happen to have open,
// disappears from the screen as soon as you change page. It's still on disk,
// but a contributor has no way to know that, and "I lost everything" is what it
// looks like. Somewhere in the header is the only place that's true on every
// step.
//
// It's absent entirely when there's nothing saved, so it costs nothing to
// someone who has never left a page half-finished.
export default function DraftsMenu({
  drafts,
  currentPath,
  pageLabel,
  onOpen,
  onDiscard,
  discarded,
  onUndo,
}: {
  drafts: DraftSummary[]
  currentPath: string
  /** `docs/pages/ai-security/overview.mdx` → `AI Security › Overview`. */
  pageLabel: (path: string) => string
  onOpen: (path: string) => void
  onDiscard: (path: string) => void
  /** Drafts just discarded, still undoable. */
  discarded: DraftSummary[]
  onUndo: (path: string) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const panelId = useId()

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      setOpen(false)
      trigger.current?.focus()
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  // Kept on screen while the last draft's Undo is still offered.
  if (drafts.length === 0 && !(open && discarded.length)) return null

  return (
    <div ref={ref} className="relative">
      <button
        ref={trigger}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={panelId}
        className="flex items-center gap-1.5 rounded-full border border-brand/40 bg-brand-soft py-1 pl-2.5 pr-2 text-xs font-medium text-brand-hover transition-colors hover:border-brand"
      >
        <PencilIcon width={13} height={13} />
        {drafts.length} draft{drafts.length === 1 ? '' : 's'}
        <ChevronDown
          className={`transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div
          id={panelId}
          className="fw-card-shadow absolute right-0 z-50 mt-2 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-fw-border bg-fw-surface"
        >
          <div className="border-b border-fw-border px-4 py-2.5">
            <p className="text-[0.8125rem] font-semibold text-fw-strong">
              Unfinished changes
            </p>
            <p className="mt-0.5 text-[0.7188rem] leading-relaxed text-fw-faint">
              Kept in this browser. Nothing has been sent.
            </p>
          </div>

          <DraftList
            drafts={drafts}
            currentPath={currentPath}
            pageLabel={pageLabel}
            onOpen={(p) => {
              onOpen(p)
              setOpen(false)
            }}
            onDiscard={onDiscard}
            discarded={discarded}
            onUndo={onUndo}
          />
        </div>
      )}
    </div>
  )
}

/**
 * The drafts, each with open and discard. A draft just discarded keeps its
 * place for a few seconds as "Draft discarded" with Undo. Also used by the
 * account menu.
 */
export function DraftList({
  drafts,
  currentPath,
  pageLabel,
  onOpen,
  onDiscard,
  discarded,
  onUndo,
}: {
  drafts: DraftSummary[]
  currentPath: string
  pageLabel: (path: string) => string
  onOpen: (path: string) => void
  onDiscard: (path: string) => void
  discarded: DraftSummary[]
  onUndo: (path: string) => void
}) {
  const live = new Set(drafts.map((d) => d.path))
  const rows = [
    ...drafts.map((d) => ({ d, gone: false })),
    ...discarded.filter((d) => !live.has(d.path)).map((d) => ({ d, gone: true })),
  ].sort((a, b) => b.d.savedAt - a.d.savedAt)

  return (
    <ul className="max-h-72 overflow-y-auto">
      {rows.map(({ d, gone }) =>
        gone ? (
          <li key={d.path} className="px-2 py-1.5">
            <div
              role="status"
              className="flex items-center justify-between gap-2 rounded-lg bg-fw-surface-2 px-3 py-2"
            >
              <span className="text-[0.8125rem] text-fw-text">Draft discarded</span>
              <button
                type="button"
                onClick={() => onUndo(d.path)}
                className="rounded-md border border-fw-border px-2.5 py-1 text-xs font-medium text-brand-hover hover:border-brand"
              >
                Undo
              </button>
            </div>
          </li>
        ) : (
          <li
            key={d.path}
            className="flex items-center gap-2 border-b border-fw-border-soft px-3 py-2 last:border-b-0"
          >
            <button
              onClick={() => onOpen(d.path)}
              className="min-w-0 flex-1 rounded-md px-1 py-0.5 text-left hover:bg-fw-surface-2"
            >
              <span className="line-clamp-2 text-sm font-medium text-fw-text">
                {pageLabel(d.path)}
                {d.path === currentPath && (
                  <span className="ml-1.5 text-xs font-normal text-fw-faint">· open</span>
                )}
              </span>
              <span className="block text-xs text-fw-faint">
                {d.edits} section{d.edits === 1 ? '' : 's'}, {relativeTime(d.savedAt)}
              </span>
            </button>
            <button
              onClick={() => onDiscard(d.path)}
              title="Discard this draft"
              aria-label={`Discard the draft for ${pageLabel(d.path)}`}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-fw-faint hover:bg-fw-surface-2 hover:text-fw-text"
            >
              <TrashIcon />
            </button>
          </li>
        ),
      )}
    </ul>
  )
}

/** Enough to recognise a draft by. */
export function relativeTime(at: number): string {
  const mins = Math.round((Date.now() - at) / 60000)
  if (mins < 2) return 'a moment ago'
  if (mins < 60) return `${mins} minutes ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`
  const days = Math.round(hours / 24)
  return days === 1 ? 'yesterday' : `${days} days ago`
}
