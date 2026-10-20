import { useEffect, useState } from 'react'
import PrPreviewCard from './PrPreviewCard.js'
import DocFrame, { SAMPLE_ADDITION } from './DocFrame.js'

// Three frames: you type, the wizard works out what changed, GitHub gets a pull
// request. It's the same claim the copy makes, except you watch it happen
// instead of being asked to take it on faith — which is the difference between
// "this sounds manageable" and "oh, that's all it is".
//
// The edit on screen is a real one of the kind the page asks for: a vague
// sentence made specific. Deliberately small, so what stands out is how little
// there is to it.
//
// Everything is drawn in the app's own tokens rather than being a screenshot,
// so it follows the theme, stays sharp at any zoom, and can't go stale.

const STAGES = ['type', 'diff', 'pr'] as const
type Stage = (typeof STAGES)[number]

const CAPTIONS: Record<Stage, { step: string; text: string }> = {
  type: { step: '1', text: 'You type, like it was a document' },
  diff: { step: '2', text: 'The wizard works out what changed' },
  pr: { step: '3', text: 'And files it on GitHub for you' },
}

const TYPE_MS = 45 // per character
const HOLD_AFTER_TYPING_MS = 1300
const DIFF_MS = 2900
const PR_MS = 4600

export default function MiniDemo() {
  const reduced = usePrefersReducedMotion()
  const [stage, setStage] = useState<Stage>('type')
  const [typed, setTyped] = useState(0)

  useEffect(() => {
    // With reduced motion the frames are all rendered at once and nothing
    // advances, so there is no timer to run.
    if (reduced) return

    if (stage === 'type') {
      setTyped(0)
      let hold: ReturnType<typeof setTimeout> | undefined
      let i = 0
      const tick = setInterval(() => {
        i += 1
        setTyped(i)
        if (i >= SAMPLE_ADDITION.length) {
          clearInterval(tick)
          hold = setTimeout(() => setStage('diff'), HOLD_AFTER_TYPING_MS)
        }
      }, TYPE_MS)
      return () => {
        clearInterval(tick)
        clearTimeout(hold)
      }
    }

    const t = setTimeout(
      () => setStage(stage === 'diff' ? 'pr' : 'type'),
      stage === 'diff' ? DIFF_MS : PR_MS,
    )
    return () => clearTimeout(t)
  }, [stage, reduced])

  // Reduced motion: the same three beats, stacked and still.
  if (reduced) {
    return (
      <section>
        <div className="space-y-4">
          {STAGES.map((s) => (
            <figure key={s} className="rounded-xl border border-fw-border bg-fw-surface-2/30 p-4">
              <Caption stage={s} />
              <div className="mt-3">
                <Frame stage={s} typed={SAMPLE_ADDITION.length} />
              </div>
            </figure>
          ))}
        </div>
      </section>
    )
  }

  return (
    <section>
      <div className="rounded-xl border border-fw-border bg-fw-surface-2/30 p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <Caption stage={stage} />
          {/* Where you are in the loop, and a way out of waiting for it.
              The dot is 6px but the button around it is 24, because a 6px
              target is one nobody hits with a thumb. */}
          <div className="flex shrink-0 items-center">
            {STAGES.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStage(s)}
                aria-label={`Show step ${CAPTIONS[s].step}: ${CAPTIONS[s].text}`}
                aria-current={s === stage ? 'true' : undefined}
                className="group flex h-6 items-center justify-center rounded px-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/60"
              >
                <span
                  className={`block h-1.5 rounded-full transition-all ${
                    s === stage
                      ? 'w-5 bg-brand'
                      : 'w-1.5 bg-fw-border group-hover:bg-fw-faint'
                  }`}
                />
              </button>
            ))}
          </div>
        </div>

        {/* Every frame is laid into the same grid cell, so the row is as tall as
            the tallest of them and the box holds still while they swap. A box
            that resized to each frame would be tighter, but it would reflow the
            whole page under it three times a loop, and the demo is meant to be
            watched rather than to shove the reading position around.

            `items-center` is the part that matters. The height has to be the
            tallest frame's, so the shorter two have space to spare either way —
            centred it reads as room around the frame, where pinned to the top it
            would read as a hole underneath it.

            Only the last child is visible; the rest are `invisible`, which keeps
            them out of the tab order as well as out of sight.

            The column is spelled out as `minmax(0,1fr)` rather than left
            implicit, and every child gets `min-w-0`. Both are needed: an
            implicit track is `auto`, which sizes to its content's max-content
            and is *not* clamped by the container, and grid items get
            `min-width: auto`, which stops them shrinking below min-content.
            Either one lets a long unbreakable line in a frame push the track,
            and the frame with it, off the right of the box. `minmax(0,1fr)`
            pins the track to the box and `min-w-0` lets the frame shrink into
            it. */}
        <div className="mt-4 grid grid-cols-[minmax(0,1fr)] items-center">
          {STAGES.map((s) => (
            <div
              key={`reserve-${s}`}
              aria-hidden="true"
              className="invisible col-start-1 row-start-1 min-w-0"
            >
              <Frame stage={s} typed={SAMPLE_ADDITION.length} />
            </div>
          ))}

          {/* Keyed on the stage so each frame re-enters rather than cross-fading
              into the last one's layout. */}
          <div
            key={stage}
            className="fw-demo-frame col-start-1 row-start-1 min-w-0"
          >
            <Frame stage={stage} typed={typed} />
          </div>
        </div>
      </div>
    </section>
  )
}

function Caption({ stage }: { stage: Stage }) {
  const { step, text } = CAPTIONS[stage]
  return (
    // `min-w-0` so the caption can wrap on a phone instead of pushing the
    // pager off the edge of the box — a flex child won't shrink below its
    // content without it.
    <div className="flex min-w-0 items-center gap-2.5">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand text-[11px] font-bold text-white">
        {step}
      </span>
      <span className="text-[13px] font-semibold leading-snug text-fw-strong">
        {text}
      </span>
    </div>
  )
}

function Frame({ stage, typed }: { stage: Stage; typed: number }) {
  if (stage === 'pr') return <PrPreviewCard />
  return <DocFrame typed={typed} diff={stage === 'diff'} />
}

/** Honours the OS "reduce motion" setting, and keeps honouring it if the
 *  contributor changes it while the page is open. */
function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(
    () =>
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  )

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const onChange = () => setReduced(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  return reduced
}
