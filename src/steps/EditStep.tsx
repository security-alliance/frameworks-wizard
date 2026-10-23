import { useEffect, useMemo, useState } from 'react'
import BlockEditor from '../components/editor/BlockEditor.js'
import Toolbar from '../components/editor/Toolbar.js'
import {
  Card,
  ExternalIcon,
  FocusIcon,
  ExitFocusIcon,
} from '../components/ui.js'
import { titleize } from '../lib/format.js'
import type { Editor } from '@tiptap/react'
import type { Block, PageEntry } from '../lib/types.js'
import type { ReactNode } from 'react'

const SITE_URL = 'https://frameworks.securityalliance.org'

// Step: edit the page. The contributor sees a document, not a file — headings,
// paragraphs and checklists are edited directly, while the technical scaffold
// (imports, tag list, credits) is locked and labelled rather than shown as code.
//
// The document simply flows and the page scrolls once, the way a document
// should. A fixed-height box inside a scrolling page would mean writing into a
// window inside a window: two scrollbars, and a writing area about 570px tall
// on an ordinary laptop once the header and toolbar are taken out of it. What
// has to stay on screen — which page this is, and the formatting controls —
// sticks to the top instead of being held there by a box.
export default function EditStep({
  loading,
  error,
  blocks,
  wrap,
  onChangeBlock,
  dirty,
  onReset,
  current,
  focus,
  onToggleFocus,
  restored,
  onDiscardDraft,
  onDismissRestored,
  persisted,
}: {
  loading: boolean
  error: string | null
  blocks: Block[]
  /** The page's hard-wrap width, from `wrapWidth`. */
  wrap: number
  onChangeBlock: (id: string, text: string) => void
  dirty: boolean
  onReset: () => void
  current?: PageEntry
  /** Everything that isn't the page is hidden. */
  focus: boolean
  onToggleFocus: () => void
  /** What a saved draft did to this page when it loaded, if there was one. */
  restored: { applied: number; skipped: number } | null
  onDiscardDraft: () => void
  onDismissRestored: () => void
  /** False when this browser refused to keep the draft. */
  persisted: boolean
}) {
  // Which section has the cursor. It lives up here rather than in BlockEditor so
  // the toolbar can sit in the sticky header with the page identity — one band
  // that stays put, rather than two things stuck at two different offsets.
  const [activeEditor, setActiveEditor] = useState<Editor | null>(null)

  // Resetting the edits, or switching page, rebuilds the block list from scratch
  // and destroys every editor instance with it; holding on to one would leave
  // the toolbar driving a dead ProseMirror view. Typing must *not* trip this:
  // every keystroke produces a new `blocks` array with the same block ids, and
  // dropping the active editor there would disarm the toolbar mid-sentence.
  const identity = useMemo(() => blocks.map((b) => b.id).join('|'), [blocks])
  useEffect(() => setActiveEditor(null), [identity])

  const width = focus ? 'max-w-248' : 'max-w-4xl'

  return (
    <>
      {/* Above the card, not inside it. Tucked under the sticky header among
          the toolbar and the page name it would read as more editor furniture,
          which is exactly what the eye skips on the way to the text. */}
      <DraftNotice
        restored={restored}
        onDiscardDraft={onDiscardDraft}
        onDismiss={onDismissRestored}
        persisted={persisted}
        className={`mx-auto mb-4 ${width}`}
      />

      {/* No `overflow-hidden` on the card: it would make this a scroll container
          and `position: sticky` inside it would quietly stop working. The header
          rounds its own top corners instead.
          Focus mode gives the card a little more room as the chrome folds away,
          and takes 300ms over it to match. Without the growth the mode would
          only be a subtraction — things leave, nothing arrives, and the editor
          ends up somewhere it was never seen to move to. */}
      <Card
        className={`mx-auto flex flex-col p-0 transition-[max-width] duration-300 ease-out motion-reduce:transition-none ${width}`}
      >
        <div className="sticky top-0 z-20 rounded-t-2xl border-b border-fw-border bg-fw-surface/95 backdrop-blur">
          <div className="flex items-center justify-between gap-4 px-5 py-2.5">
            <PageIdentity current={current} />

            <div className="flex shrink-0 items-center gap-2">
              {dirty && (
                <button
                  onClick={onReset}
                  className="rounded-md px-2 py-1 text-xs font-medium text-fw-muted hover:bg-fw-surface-2 hover:text-fw-text"
                >
                  Undo all changes
                </button>
              )}

              {/* Leaving is a labelled word, not a glyph. Entering hides the
                  stepper, the brand bar and the step controls, so the icon that
                  got you in is one of the few things still on screen and the way
                  back out has to be unmissable. */}
              {focus ? (
                <button
                  onClick={onToggleFocus}
                  className="flex items-center gap-1.5 rounded-md border border-fw-border px-2 py-1 text-xs font-medium text-fw-muted hover:border-brand/60 hover:text-fw-text"
                >
                  <ExitFocusIcon />
                  Exit focus
                  <kbd className="ml-0.5 rounded border border-fw-border bg-fw-surface-2 px-1 font-mono text-[10px] text-fw-faint">
                    Esc
                  </kbd>
                </button>
              ) : (
                <button
                  onClick={onToggleFocus}
                  title="Hide everything except the page"
                  aria-label="Focus mode"
                  className="flex h-7 w-7 items-center justify-center rounded-md text-fw-faint hover:bg-fw-surface-2 hover:text-fw-text"
                >
                  <FocusIcon />
                </button>
              )}

              {current && (
                <a
                  href={`${SITE_URL}/${current.rel.replace(/\.mdx$/, '')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Open the live page in a new tab"
                  className="flex h-7 w-7 items-center justify-center rounded-md text-fw-faint hover:bg-fw-surface-2 hover:text-fw-text"
                >
                  <ExternalIcon width="15" height="15" />
                </a>
              )}
            </div>
          </div>

          {!loading && !error && <Toolbar editor={activeEditor} />}
        </div>

        {error ? (
          <Centered>
            <span className="text-red-400">We couldn&apos;t open this page.</span>
            <span className="mt-1 block text-xs text-fw-faint">{error}</span>
          </Centered>
        ) : loading ? (
          <Centered>Opening the page…</Centered>
        ) : (
          <BlockEditor
            blocks={blocks}
            wrap={wrap}
            onChangeBlock={onChangeBlock}
            focus={focus}
            onFocusEditor={setActiveEditor}
          />
        )}
      </Card>
    </>
  )
}

// What the draft did, said once and then out of the way.
//
// It reports rather than asks. Reloading a page you were writing on has one
// likely intent, and it isn't "throw my work away" — so the work comes back and
// this says so. Undoing is a click on "Undo all changes" in the header, which
// exists anyway and is the same control someone would reach for to drop edits
// they made deliberately.
function DraftNotice({
  restored,
  onDiscardDraft,
  onDismiss,
  persisted,
  className = '',
}: {
  restored: { applied: number; skipped: number } | null
  onDiscardDraft: () => void
  onDismiss: () => void
  persisted: boolean
  className?: string
}) {
  if (!persisted) {
    return (
      <div className={className}>
        <div className="rounded-xl border border-fw-border bg-fw-surface-2/60 px-4 py-2.5 text-[12.5px] leading-relaxed text-fw-muted">
          This browser won&apos;t let us keep a draft, usually because of
          private browsing. Your changes are safe while this tab is open, but
          they won&apos;t survive a reload.
        </div>
      </div>
    )
  }

  if (!restored) return null

  // Nothing landed, and the draft is still the only copy of that work. Loud,
  // because the page on screen looks untouched and the writing is one click
  // from looking lost.
  if (restored.applied === 0) {
    return (
      <div className={className}>
        <div className="rounded-xl border border-brand/40 bg-brand-soft px-4 py-3">
          <p className="text-[13px] font-semibold text-fw-strong">
            Your saved changes don&apos;t fit this page any more
          </p>
          <p className="mt-1 text-[12.5px] leading-relaxed text-fw-muted">
            The {restored.skipped} section{restored.skipped === 1 ? '' : 's'} you
            edited {restored.skipped === 1 ? 'has' : 'have'} since changed in the
            repository, so putting your text back could have dropped it in the
            wrong place. Nothing has been deleted, and your draft is still
            saved.
          </p>
          <button
            onClick={onDiscardDraft}
            className="mt-2 rounded-md border border-fw-border px-2 py-1 text-xs font-medium text-fw-muted hover:border-brand/60 hover:text-fw-text"
          >
            Discard the draft
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className={className}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-brand/30 bg-brand-soft/50 px-4 py-2.5">
        <p className="min-w-0 flex-1 text-[12.5px] leading-relaxed text-fw-text">
          <span className="font-semibold text-fw-strong">
            Picked up where you left off.
          </span>{' '}
          {restored.applied} section{restored.applied === 1 ? '' : 's'} restored
          from this browser.
          {restored.skipped > 0 && (
            <>
              {' '}
              {restored.skipped} couldn&apos;t be placed, because that part of
              the page has changed since you wrote it.
            </>
          )}
        </p>
        <button
          onClick={onDismiss}
          className="shrink-0 rounded-md px-2 py-1 text-xs font-medium text-fw-muted hover:bg-fw-surface-2 hover:text-fw-text"
        >
          Got it
        </button>
      </div>
    </div>
  )
}

// Which page is open. Two steps back from here the contributor picked it out of
// 350; by the time they're deep in a paragraph it should still be on screen,
// which is the sticky header's job.
function PageIdentity({ current }: { current?: PageEntry }) {
  if (!current) {
    return <h2 className="text-sm font-semibold text-fw-strong">Make your changes</h2>
  }
  return (
    <div className="min-w-0">
      <h2 className="truncate text-sm font-semibold text-fw-strong">
        {titleize(current.name)}
      </h2>
      <p className="truncate text-[11px] text-fw-faint">
        {[current.framework, ...current.subdir].map(titleize).join(' › ')} · nothing is
        published until we review it
      </p>
    </div>
  )
}

function Centered({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-64 items-center justify-center px-6 text-center text-sm text-fw-muted">
      <div>{children}</div>
    </div>
  )
}
