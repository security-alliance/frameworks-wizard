import { useEffect, useState } from 'react'
import { CheckIcon } from '../ui.js'
import { DESCRIPTION_RANGE, PRIMARY_TAGS, fetchTags, linkOf } from '../../lib/newPages.js'
import type { NewPage } from '../../lib/newPages.js'
import type { PageEntry } from '../../lib/types.js'
import { descriptionPrompt } from '../../lib/descriptionPrompt.js'

// What a new page needs besides its text, docked beside the editor like the
// formatting help. Asked for here, once there's a page to describe, rather than
// before the first word: the description, the tags and the place in the
// sidebar. The title is the page's own heading, edited in the page.
//
// The list at the top is what's left. Sending waits for the description and
// the tags; the section map is a nudge (see sectionMap.ts).

export interface DetailsStatus {
  title: boolean
  tags: boolean
  description: boolean
  /** Null while it's being worked out. */
  listed: boolean | null
}

/** How many of the checklist's items are still open, for the header badge. */
export const detailsLeft = (s: DetailsStatus) =>
  [s.title, s.tags, s.description, s.listed !== false].filter((done) => !done).length

export default function PageDetails({
  page,
  siblings,
  status,
  onChange,
  onAddToMap,
  onClose,
  id,
  className = '',
}: {
  page: NewPage
  /** The section's pages in the sidebar, in order, without this one. */
  siblings: PageEntry[]
  status: DetailsStatus
  onChange: (page: NewPage) => void
  /** Add the page's row to its section map; absent when there's no map. */
  onAddToMap?: () => void
  onClose: () => void
  id?: string
  className?: string
}) {
  // Where it sits among the section's pages: after `after`, or first.
  const at = page.after ? siblings.findIndex((p) => linkOf(p.path) === page.after) + 1 : 0
  // A section's overview introduces it and maps its pages, so it stays first:
  // a new page can go anywhere after it, never above it.
  const floor = siblings[0] && /\/overview\.mdx$/.test(siblings[0].path) ? 1 : 0
  const moveTo = (i: number) =>
    onChange({
      ...page,
      after: i === 0 ? '' : linkOf(siblings[i - 1].path),
      before: i === 0 && siblings.length ? linkOf(siblings[0].path) : '',
    })
  const rows = siblings.map((p) => ({ title: p.title, mine: false }))
  rows.splice(at, 0, { title: page.title, mine: true })

  return (
    <aside id={id} aria-label="Page details" className={className}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-base font-semibold text-fw-strong">Page details</h2>
        <button
          type="button"
          onClick={onClose}
          className="text-xs text-fw-faint hover:text-fw-text"
          aria-label="Close page details"
        >
          Close
        </button>
      </div>
      <p className="mt-0.5 text-xs text-fw-faint">Needed before you send</p>

      <ul className="mt-4 space-y-2 rounded-lg bg-fw-surface-2/60 p-3 text-sm">
        <Check done={status.title}>Title</Check>
        <Check done={status.tags}>Tags</Check>
        <Check done={status.description}>Description</Check>
        <Check done={status.listed === true}>
          Listed in the section map
          {status.listed === false && onAddToMap && (
            <button type="button" onClick={onAddToMap} className="ml-2 text-xs font-medium text-brand-hover underline">
              Add it
            </button>
          )}
        </Check>
      </ul>

      <section className="mt-6">
        <DescriptionField id="pd-desc" page={page} onChange={onChange} />
      </section>

      <section className="mt-6">
        <TagPicker page={page} onChange={onChange} />
      </section>

      {siblings.length > 0 && (
        <section className="mt-6">
          <span className={LABEL}>Place in the sidebar</span>
          <ol className="mt-2 rounded-lg border border-fw-border p-1.5 text-[0.8125rem]">
            {rows.map((r, i) =>
              r.mine ? (
                <li
                  key="mine"
                  className="flex items-center gap-1 rounded-md bg-brand-soft px-2 py-1.5 font-medium text-fw-strong"
                >
                  <span className="min-w-0 flex-1 truncate">{r.title}</span>
                  <MoveButton label="Move up" disabled={i <= floor} onClick={() => moveTo(i - 1)}>
                    ↑
                  </MoveButton>
                  <MoveButton label="Move down" disabled={i === rows.length - 1} onClick={() => moveTo(i + 1)}>
                    ↓
                  </MoveButton>
                </li>
              ) : (
                <li key={`${r.title}-${i}`} className="truncate px-2 py-1.5 text-fw-muted">
                  {r.title}
                </li>
              ),
            )}
          </ol>
        </section>
      )}
    </aside>
  )
}

function Check({ done, children }: { done: boolean; children: React.ReactNode }) {
  return (
    <li className="flex items-center gap-2.5">
      <span
        className={`flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-full border ${
          done ? 'border-add bg-add text-white' : 'border-fw-faint'
        }`}
        aria-hidden
      >
        {done && <CheckIcon width={11} height={11} />}
      </span>
      <span className={done ? 'text-fw-text' : 'text-fw-muted'}>
        {children}
        <span className="sr-only">{done ? ' (done)' : ' (to do)'}</span>
      </span>
    </li>
  )
}

function Tag({ on, onClick, children }: { on: boolean; onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
        on ? 'border-brand bg-brand/15 text-fw-strong' : 'border-fw-border text-fw-muted hover:border-brand/60 hover:text-fw-text'
      }`}
    >
      {children}
    </button>
  )
}

function MoveButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string
  disabled: boolean
  onClick: () => void
  children: string
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="flex h-6 w-6 items-center justify-center rounded text-fw-muted hover:bg-fw-surface hover:text-fw-strong disabled:opacity-30"
    >
      {children}
    </button>
  )
}

const LABEL = 'text-sm font-semibold text-fw-strong'
const HINT = 'mt-1 text-[0.8125rem] leading-relaxed text-fw-muted'

/** A new page's description, with the template's length range. Also on Send. */
export function DescriptionField({
  id,
  page,
  onChange,
}: {
  id: string
  page: NewPage
  onChange: (page: NewPage) => void
}) {
  const length = page.description.trim().length
  const [lo, hi] = DESCRIPTION_RANGE
  return (
    <>
      <label htmlFor={id} className={LABEL}>
        Description
      </label>
      <p className={HINT}>What search engines show. Start with the topic, then name the tools, attacks or standards it covers.</p>
      {/* Right under the hint, where it's seen before the empty box. */}
      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
        <AskAi path={page.path} />
      </div>
      <textarea
        id={id}
        value={page.description}
        onChange={(e) => onChange({ ...page, description: e.target.value.replace(/\n/g, ' ') })}
        rows={3}
        className="mt-2 w-full rounded-lg border border-fw-border bg-fw-surface-2 px-3 py-2 text-sm text-fw-text placeholder:text-fw-faint focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
      />
      <p className={`mt-1 text-xs ${length >= lo && length <= hi ? 'text-add' : 'text-fw-faint'}`}>
        {length} of {lo} to {hi} characters
      </p>
    </>
  )
}

// A prompt the contributor gives their own AI tool, which writes a description
// from the page (see descriptionPrompt.ts). The note says what to do with it;
// where the clipboard isn't allowed, the prompt is shown to copy by hand.
function AskAi({ path }: { path: string }) {
  const [state, setState] = useState<null | { failed: boolean; text: string }>(null)
  async function copy() {
    const text = descriptionPrompt(path)
    if (!text) return
    try {
      await navigator.clipboard.writeText(text)
      setState({ failed: false, text })
    } catch {
      setState({ failed: true, text })
    }
  }
  return (
    <>
      <button type="button" onClick={copy} className="text-xs font-medium text-brand-hover underline">
        Copy a prompt for your AI
      </button>
      {state && (
        <div role="status" className="basis-full rounded-lg bg-brand-soft/40 px-3 py-2 text-xs leading-relaxed text-fw-text">
          {state.failed ? (
            <>
              <p>Copy this into your AI chat, then paste its answer in the description below.</p>
              <textarea
                readOnly
                value={state.text}
                rows={5}
                onFocus={(e) => e.currentTarget.select()}
                className="mt-2 w-full rounded border border-fw-border bg-fw-surface-2 p-2 font-mono text-[0.6875rem] text-fw-muted"
              />
            </>
          ) : (
            <p>
              Copied. Paste it into your AI chat (ChatGPT, Claude, or any other), then paste its answer in the
              description below and check it reads right.
            </p>
          )}
          <button type="button" onClick={() => setState(null)} className="mt-1 text-fw-faint underline hover:text-fw-text">
            Close
          </button>
        </div>
      )}
    </>
  )
}

/** A new page's tags: the usual five first, the rest on request. Also on Send. */
export function TagPicker({ page, onChange }: { page: NewPage; onChange: (page: NewPage) => void }) {
  const [known, setKnown] = useState<string[]>([])
  const [more, setMore] = useState(false)
  const [own, setOwn] = useState('')
  useEffect(() => {
    fetchTags().then(setKnown)
  }, [])

  const tags = page.tags ?? []
  const others = [...new Set([...known, ...tags])].filter((t) => !PRIMARY_TAGS.includes(t))
  const shown = more ? others : others.filter((t) => tags.includes(t))
  const toggle = (t: string) =>
    onChange({ ...page, tags: tags.includes(t) ? tags.filter((x) => x !== t) : [...tags, t] })
  const addOwn = () => {
    const t = own.trim().replace(/\s+/g, ' ')
    if (t && !tags.includes(t)) onChange({ ...page, tags: [...tags, t] })
    setOwn('')
  }

  return (
    <>
      <span className={LABEL}>Tags</span>
      <p className={HINT}>Who the page is for. Pre-picked from what this section usually uses.</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {[...PRIMARY_TAGS, ...shown].map((t) => (
          <Tag key={t} on={tags.includes(t)} onClick={() => toggle(t)}>
            {t}
          </Tag>
        ))}
      </div>
      {others.length > shown.length || more ? (
        <button
          type="button"
          onClick={() => setMore((m) => !m)}
          className="mt-2 text-xs font-medium text-brand-hover underline"
        >
          {more ? 'Fewer tags' : `More tags (${others.length - shown.length})`}
        </button>
      ) : null}
      <div className="mt-2 flex gap-2">
        <input
          value={own}
          onChange={(e) => setOwn(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              addOwn()
            }
          }}
          placeholder="Another tag"
          aria-label="Add another tag"
          className="min-w-0 flex-1 rounded-lg border border-fw-border bg-fw-surface-2 px-2.5 py-1.5 text-xs text-fw-text placeholder:text-fw-faint focus:border-brand focus:outline-none"
        />
        <button
          type="button"
          onClick={addOwn}
          disabled={!own.trim()}
          className="rounded-lg border border-fw-border px-2.5 text-xs font-medium text-fw-text hover:border-brand disabled:opacity-40"
        >
          Add
        </button>
      </div>
    </>
  )
}
