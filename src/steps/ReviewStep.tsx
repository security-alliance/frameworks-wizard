import { useEffect, useMemo, useRef, useState } from 'react'
import Preview from '../components/Preview.js'
import DiffView from '../components/DiffView.js'
import { ArrowDown, Card, ChevronDown } from '../components/ui.js'
import { annotateBlocks, changesOnly } from '../lib/inlineDiff.js'
import { joinBlocks } from '../lib/blocks.js'
import { headingSkips } from '../lib/headings.js'
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

  const { body, changedBlocks, pieces } = useMemo(() => annotateBlocks(blocks), [blocks])

  // Opens on the changes alone, the way a pull request does; the whole page is
  // one click away, and so is each run of unchanged sections in between. With
  // nothing changed yet there's nothing to narrow down to, so it's the page.
  const [wholePage, setWholePage] = useState(false)
  const [expanded, setExpanded] = useState<Set<number>>(new Set())
  const changesView = dirty && !wholePage
  const shownBody = useMemo(
    () => (changesView ? changesOnly(blocks, pieces, expanded) : body),
    [changesView, blocks, pieces, expanded, body],
  )
  const editedBody = useMemo(() => joinBlocks(blocks), [blocks])
  const skips = useMemo(() => headingSkips(editedBody), [editedBody])

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
    <Card className="mx-auto flex h-[72vh] h-[72dvh] max-w-4xl flex-col overflow-hidden p-0">
      {/* Narrow: the controls go under the title rather than squeezing it
          into a column a word wide. */}
      <div className="flex flex-col gap-2 border-b border-fw-border px-4 py-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4 sm:px-5">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-fw-strong">Check your changes</h2>
          <p className="text-xs text-fw-faint">
            {dirty
              ? 'Your additions are highlighted, removals are crossed out.'
              : 'You haven’t changed anything yet.'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:shrink-0 sm:flex-nowrap">
        {dirty && !technical && (
          <div role="group" aria-label="What to show" className="flex rounded-full bg-fw-surface-2 p-0.5 text-xs font-medium">
            {[
              { whole: false, label: 'Changes only' },
              { whole: true, label: 'Whole page' },
            ].map((o) => (
              <button
                key={o.label}
                type="button"
                aria-pressed={wholePage === o.whole}
                onClick={() => {
                  setWholePage(o.whole)
                  setExpanded(new Set())
                  stop.current = 0
                }}
                className={`rounded-full px-2.5 py-1 transition-colors ${
                  wholePage === o.whole ? 'bg-fw-surface text-fw-strong shadow-sm' : 'text-fw-muted hover:text-fw-text'
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
        )}
        <button
          type="button"
          onClick={handleCount}
          disabled={!dirty}
          title={dirty ? 'Jump to the next change' : undefined}
          className={`flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
            dirty
              ? 'bg-brand-soft text-brand-hover hover:bg-brand hover:text-white'
              : 'cursor-default bg-fw-surface-2 text-fw-faint'
          }`}
        >
          {dirty
            ? `${changedBlocks} section${changedBlocks === 1 ? '' : 's'} changed`
            : 'No changes'}
          {/* The arrow says it goes somewhere: each press scrolls to the next
              change, which a count on its own doesn't suggest. */}
          {dirty && <ArrowDown width={13} height={13} aria-hidden />}
        </button>
        </div>
      </div>

      {skips.length > 0 && <HeadingSkips skips={skips} />}

      <div className="min-h-0 flex-1 overflow-hidden bg-fw-bg">
        {technical ? (
          <DiffView original={originalBody} edited={editedBody} />
        ) : (
          <Preview
            body={shownBody}
            frontmatter={fm}
            contributors={contributors}
            scrollRef={previewRef}
            onExpandGap={(id) => setExpanded((e) => new Set(e).add(id))}
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

const LEVEL_NAMES: Record<number, string> = {
  1: 'the page title',
  2: 'a heading',
  3: 'a subheading',
  4: 'a small heading',
}
const levelName = (n: number) => LEVEL_NAMES[n] ?? `a level ${n} heading`

// A heading that skips a level. The edit step's menu won't make one, but it can
// still happen, e.g. by turning a subheading into a heading above the small
// headings that were under it. The docs' automatic check would fail the pull
// request, so it's said here, while it's one step back to fix.
function HeadingSkips({ skips }: { skips: ReturnType<typeof headingSkips> }) {
  return (
    <div className="border-b border-fw-border bg-brand-soft/50 px-5 py-2.5 text-[0.7813rem] leading-relaxed text-fw-text">
      <p className="font-semibold text-fw-strong">
        {skips.length === 1 ? 'A heading skips a level' : `${skips.length} headings skip a level`}
      </p>
      <ul className="mt-1 space-y-0.5 text-fw-muted">
        {skips.map(({ heading, above }, i) => (
          <li key={i}>
            &ldquo;{heading.text}&rdquo; is {levelName(heading.level)} straight under{' '}
            {levelName(above.level)}, &ldquo;{above.text}&rdquo;. Go back and make it{' '}
            {levelName(above.level + 1)}.
          </li>
        ))}
      </ul>
      <p className="mt-1 text-fw-faint">
        Headings go down one level at a time. The docs&apos; automatic check
        fails a page that skips one.
      </p>
    </div>
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
