import { useState } from 'react'
import { Button } from '../../components/ui.js'
import { MAX_TITLE, linkOf, newPagePath, slugify, starterBody } from '../../lib/newPages.js'
import type { NewPage } from '../../lib/newPages.js'
import type { PageEntry } from '../../lib/types.js'

// Starting a new page, right where the contributor clicked in the page list.
//
// The section is where they clicked, so all that's asked is a title. The
// address is made from it and shown, not asked for. The page goes at the end
// of its section; the description, the tags and the place in the sidebar wait
// for Page details, once there's a page to describe.
export default function NewPageStart({
  folder,
  sectionName,
  siblings,
  taken,
  onStart,
  onCancel,
}: {
  /** `devsecops/isolation` */
  folder: string
  /** "Isolation & Sandboxing" */
  sectionName: string
  /** The pages already in the section's sidebar, in order. */
  siblings: PageEntry[]
  /** Every page path already in use. */
  taken: Set<string>
  onStart: (page: NewPage) => void
  onCancel: () => void
}) {
  const [title, setTitle] = useState('')
  const t = title.trim()
  const path = newPagePath(folder, slugify(t))
  const problem = !t
    ? null
    : t.length > MAX_TITLE
      ? `Keep it under ${MAX_TITLE} characters, so it fits in search results.`
      : !path
        ? 'Use at least one letter or number.'
        : taken.has(path)
          ? 'There’s already a page with this title here. Choose another.'
          : null
  const ready = !!t && !problem && !!path

  function start() {
    if (!ready || !path) return
    onStart({
      path,
      title: t,
      description: '',
      tags: null,
      after: siblings.length ? linkOf(siblings[siblings.length - 1].path) : '',
      starter: starterBody(path, t),
      createdAt: Date.now(),
    })
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        start()
      }}
      onKeyDown={(e) => e.key === 'Escape' && onCancel()}
      className="mx-3 my-2 rounded-xl border border-brand/60 bg-brand-soft/40 p-4"
    >
      <label htmlFor="np-title" className="block text-sm font-semibold text-fw-strong">
        New page in {sectionName}
      </label>
      <input
        id="np-title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Title"
        autoFocus
        className="mt-2.5 w-full rounded-lg border border-fw-border bg-fw-bg px-3 py-2 text-sm text-fw-text placeholder:text-fw-faint focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
      />
      <p className="mt-2 text-xs text-fw-muted">Sentence case, per our style guide.</p>
      {path && t && (
        <p className="mt-1.5 flex min-w-0 items-center gap-2 text-xs text-fw-muted">
          Address
          <code className="truncate rounded bg-fw-surface-2 px-1.5 py-0.5 font-mono text-[0.6875rem] text-fw-text">
            {linkOf(path)}
          </code>
        </p>
      )}
      {problem && <p className="mt-1.5 text-xs text-del">{problem}</p>}
      <p className="mt-2 text-xs text-fw-muted">
        It goes at the end of this section. Description, tags and position can wait until you&apos;ve written it.
      </p>
      <div className="mt-3 flex justify-end gap-2">
        <Button type="button" variant="ghost" className="px-3 py-1.5" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" className="px-3.5 py-1.5" disabled={!ready}>
          Start writing
        </Button>
      </div>
    </form>
  )
}
