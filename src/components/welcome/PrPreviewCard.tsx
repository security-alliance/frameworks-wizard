import { REPO, BRANCH } from '../../lib/github.js'
import { SAMPLE_ORIGINAL, SAMPLE_ADDITION } from './DocFrame.js'

// The thing that comes out the other end.
//
// "We'll turn it into a proper suggestion for the maintainers" is true and
// tells you nothing you can picture. Most people arriving here have never seen
// a pull request, so the ending of the story is an abstraction — and an
// abstraction is exactly what you can't decide whether to trust.
//
// So: show one. It is deliberately a still, not a live fetch — nothing here
// depends on the network, and it renders the same before sign-in as after.
// The edit shown is the one the demo types, so the card and the frames before
// it read as one story.
//
// It takes no props: the demo frame that renders it captions it itself.

const PR_TITLE = 'docs(ai-security): update Overview'
const PR_FILE = 'docs/pages/ai-security/overview.mdx'

export default function PrPreviewCard() {
  return (
    <div>
      <div className="overflow-hidden rounded-xl border border-fw-border bg-fw-surface-2/40">
        {/* Repo bar */}
        {/* The repo slug is 28 monospace characters and the box is ~213px wide
            on a phone, so it has to be allowed to lose its head rather than
            push the status pill off the edge. */}
        <div className="flex items-center gap-2 border-b border-fw-border px-4 py-2.5">
          <GithubMark />
          <span className="min-w-0 truncate font-mono text-[11px] text-fw-muted">
            {REPO}
          </span>
          <span className="ml-auto inline-flex shrink-0 items-center gap-1.5 rounded-full bg-add-soft px-2 py-0.5 text-[11px] font-medium text-add">
            <span className="h-1.5 w-1.5 rounded-full bg-add" />
            Open
          </span>
        </div>

        <div className="px-4 py-3.5">
          <h3 className="text-[15px] font-semibold text-fw-strong">
            {PR_TITLE}{' '}
            <span className="font-normal text-fw-faint">#412</span>
          </h3>

          {/* Who opened it, and where it's headed. */}
          <div className="mt-2 flex flex-wrap items-center gap-2 text-[12px] text-fw-muted">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-brand text-[10px] font-bold text-white">
              Y
            </span>
            <span>
              <span className="font-medium text-fw-text">you</span> want to merge
              1 commit into{' '}
              <span className="rounded bg-fw-surface-2 px-1 py-0.5 font-mono text-[11px] text-fw-text">
                {BRANCH}
              </span>
            </span>
          </div>

          {/* The change itself. */}
          <div className="mt-3.5 overflow-hidden rounded-lg border border-fw-border">
            <div className="flex items-center gap-2 border-b border-fw-border bg-fw-surface-2/60 px-3 py-1.5">
              <span className="truncate font-mono text-[11px] text-fw-muted">
                {PR_FILE}
              </span>
              <span className="ml-auto shrink-0 font-mono text-[11px]">
                <span className="text-add">+1</span>{' '}
                <span className="text-del">−1</span>
              </span>
            </div>
            {/* Wraps rather than scrolls. A real diff never wraps, but the
                audience here has never seen a diff, and a horizontal scrollbar
                inside a card meant to say "this is simple" argues the opposite. The sample is short
                enough not to wrap at a normal width anyway; this is what keeps
                it honest on a phone.

                Each row is a flex line so the marker stays in its own column
                and a wrapped line hangs under the text rather than under the
                +/−. */}
            <div className="font-mono text-[11.5px] leading-relaxed">
              <div className="flex gap-1.5 bg-del-soft px-3 py-0.5 text-fw-muted">
                <span className="select-none text-del">−</span>
                <span className="min-w-0 wrap-break-word">{SAMPLE_ORIGINAL}</span>
              </div>
              <div className="flex gap-1.5 bg-add-soft px-3 py-0.5 text-fw-text">
                <span className="select-none text-add">+</span>
                <span className="min-w-0 wrap-break-word">
                  {SAMPLE_ORIGINAL}
                  <mark className="bg-transparent font-semibold text-add">
                    {SAMPLE_ADDITION}
                  </mark>
                </span>
              </div>
            </div>
          </div>

          <div className="mt-3 flex items-center gap-2 text-[12px] text-fw-faint">
            <ClockMark />
            Waiting for us to review it
          </div>
        </div>
      </div>

    </div>
  )
}

/* ---- marks used only by this card ---- */

const GithubMark = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" className="shrink-0 text-fw-faint">
    <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
  </svg>
)

const ClockMark = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="shrink-0">
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </svg>
)
