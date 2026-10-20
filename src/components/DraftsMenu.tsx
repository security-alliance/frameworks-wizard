import { useEffect, useRef, useState } from 'react'
import { ChevronDown, PencilIcon, TrashIcon } from './ui.js'
import { titleize } from '../lib/format.js'
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
  onOpen,
  onDiscard,
}: {
  drafts: DraftSummary[]
  currentPath: string
  onOpen: (path: string) => void
  onDiscard: (path: string) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  if (drafts.length === 0) return null

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
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
          role="menu"
          className="fw-card-shadow absolute right-0 z-50 mt-2 w-72 overflow-hidden rounded-xl border border-fw-border bg-fw-surface"
        >
          <div className="border-b border-fw-border px-4 py-2.5">
            <p className="text-[13px] font-semibold text-fw-strong">
              Unfinished changes
            </p>
            <p className="mt-0.5 text-[11.5px] leading-relaxed text-fw-faint">
              Kept in this browser. Nothing has been sent.
            </p>
          </div>

          <ul className="max-h-72 overflow-y-auto">
            {drafts.map((d) => (
              <li
                key={d.path}
                className="flex items-center gap-2 border-b border-fw-border-soft px-3 py-2 last:border-b-0"
              >
                <button
                  onClick={() => {
                    onOpen(d.path)
                    setOpen(false)
                  }}
                  className="min-w-0 flex-1 rounded-md px-1 py-0.5 text-left hover:bg-fw-surface-2"
                >
                  <span className="block truncate text-[12.5px] font-medium text-fw-text">
                    {pageLabel(d.path)}
                    {d.path === currentPath && (
                      <span className="ml-1.5 text-[11px] font-normal text-fw-faint">
                        · open
                      </span>
                    )}
                  </span>
                  <span className="block text-[11px] text-fw-faint">
                    {d.edits} section{d.edits === 1 ? '' : 's'} ·{' '}
                    {relativeTime(d.savedAt)}
                  </span>
                </button>
                <button
                  onClick={() => onDiscard(d.path)}
                  title="Discard this draft"
                  aria-label={`Discard the draft for ${pageLabel(d.path)}`}
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-fw-faint hover:bg-fw-surface-2 hover:text-fw-text"
                >
                  <TrashIcon />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

/** `docs/pages/ai-security/overview.mdx` → `AI Security › Overview`. */
function pageLabel(path: string): string {
  return path
    .replace(/^docs\/pages\//, '')
    .replace(/\.mdx$/, '')
    .split('/')
    .map(titleize)
    .join(' › ')
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
