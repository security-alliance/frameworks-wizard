import { useEffect, useMemo, useRef, useState } from 'react'
import Preview from '../components/Preview.js'
import DiffView from '../components/DiffView.js'
import { Card, ChevronDown } from '../components/ui.js'
import { annotateBlocks } from '../lib/inlineDiff.js'
import { joinBlocks } from '../lib/blocks.js'
import type { Block, ContributorDirectory, Frontmatter } from '../lib/types.js'

// Step: review changes.
//
// The contributor sees their page rendered, with what they added highlighted
// and what they removed struck through in place, rather than a red/green
// unified diff, which is unreadable if you've never used git. The line-by-line
// diff is still available, one click away, for anyone who wants it.
export default function ReviewStep({
  blocks,
  fm,
  originalBody,
  contributors,
  dirty,
}: {
  blocks: Block[]
  fm: Frontmatter
  originalBody: string
  contributors: ContributorDirectory
  dirty: boolean
}) {
  const [technical, setTechnical] = useState(false)
  const [pendingJump, setPendingJump] = useState(0)
  const previewRef = useRef<HTMLDivElement>(null)
  const stop = useRef(0)

  const { body, changedBlocks } = useMemo(() => annotateBlocks(blocks), [blocks])
  const editedBody = useMemo(() => joinBlocks(blocks), [blocks])

  // On a long page a one-word fix is invisible until you find it, so the count
  // is the control that takes you there — and takes you to the next one on each
  // further click.
  function jumpToChange() {
    const root = previewRef.current
    if (!root) return
    const stops = changedElements(root)
    if (stops.length === 0) return
    const target = stops[stop.current % stops.length]
    stop.current++
    target.scrollIntoView({ behavior: 'smooth', block: 'center' })
    target.classList.remove('fw-jump')
    void target.offsetWidth // restart the flash if it's the same element again
    target.classList.add('fw-jump')
  }

  function handleCount() {
    if (!dirty) return
    // Coming from the technical view, the page has to render before it can be
    // scrolled; the effect below picks it up once it has.
    if (technical) {
      setTechnical(false)
      setPendingJump((n) => n + 1)
      return
    }
    jumpToChange()
  }

  useEffect(() => {
    if (!technical && pendingJump) jumpToChange()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [technical, pendingJump])

  return (
    <Card className="mx-auto flex h-[72vh] max-w-4xl flex-col overflow-hidden p-0">
      <div className="flex items-start justify-between gap-4 border-b border-fw-border px-5 py-3">
        <div>
          <h2 className="text-sm font-semibold text-fw-strong">Check your changes</h2>
          <p className="text-xs text-fw-faint">
            {dirty
              ? 'Your additions are highlighted, removals are crossed out.'
              : 'You haven’t changed anything yet.'}
          </p>
        </div>
        <button
          type="button"
          onClick={handleCount}
          disabled={!dirty}
          title={dirty ? 'Jump to the next change' : undefined}
          className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
            dirty
              ? 'bg-brand-soft text-brand-hover hover:bg-brand hover:text-white'
              : 'cursor-default bg-fw-surface-2 text-fw-faint'
          }`}
        >
          {dirty
            ? `${changedBlocks} section${changedBlocks === 1 ? '' : 's'} changed`
            : 'No changes'}
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden bg-fw-bg">
        {technical ? (
          <DiffView original={originalBody} edited={editedBody} />
        ) : (
          <Preview
            body={body}
            frontmatter={fm}
            contributors={contributors}
            scrollRef={previewRef}
          />
        )}
      </div>

      <button
        onClick={() => setTechnical((t) => !t)}
        className="flex items-center gap-1.5 border-t border-fw-border px-5 py-2.5 text-xs font-medium text-fw-faint transition-colors hover:bg-fw-surface-2 hover:text-fw-text"
      >
        <ChevronDown className={technical ? 'rotate-180' : ''} />
        {technical ? 'Back to the page view' : 'Technical view (line by line)'}
      </button>
    </Card>
  )
}

// The page elements carrying a change mark, in document order and de-duplicated:
// a paragraph with four edited words is one stop, not four.
function changedElements(root: HTMLElement): HTMLElement[] {
  const article = root.querySelector('article') ?? root
  const stops: HTMLElement[] = []
  const MARKS = '.fw-ins, .fw-del, .fw-code-ins, .fw-code-del'
  for (const mark of root.querySelectorAll<HTMLElement>(MARKS)) {
    let el: HTMLElement = mark
    while (el.parentElement && el.parentElement !== article) el = el.parentElement
    if (el.parentElement === article && stops[stops.length - 1] !== el) stops.push(el)
  }
  return stops
}
