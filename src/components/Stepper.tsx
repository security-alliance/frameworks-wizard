import { STEPS } from '../wizard/steps.js'
import type { StepId } from '../wizard/steps.js'
import { CheckIcon } from './ui.js'

// Where you are, and what's true there.
//
// It has to look like something you can press: pointer cursor, a hover surface
// rather than a hairline, and steps you can't reach dimmed *before* you touch
// them, so the difference is visible rather than discoverable.
//
// The second line under each label carries what is actually true at that step
// right now (who you're signed in as, which page you picked, how many sections
// you've changed) rather than a synonym of the label. A line that changes reads
// as live, which is also the cheapest way to make the thing look interactive.

export default function Stepper({
  current,
  onJump,
  maxReached,
  status = {},
}: {
  current: number
  onJump: (index: number) => void
  maxReached: number
  /** What's true under each step right now. Falls back to the step's own
   *  static blurb wherever there's nothing live to say. */
  status?: Partial<Record<StepId, string>>
}) {
  const pct = (current / (STEPS.length - 1)) * 100
  const activeStep = STEPS[current]
  const activeStatus = status[activeStep.id] ?? activeStep.sub

  return (
    <nav aria-label="Progress" className="mx-auto w-full max-w-5xl px-4">
      {/* Narrow: one line.
          The full run needs 40rem before the labels collide. Below `md` it isn't
          a strip you drag sideways, because a status display you have to
          scroll to read is not telling you your status. The circles say three
          things (which step, how far along, what's true here) and the rail below
          already says the second, so the other two fit on a line. Stepping back
          on a phone is the Back button under the page, which is a button and
          says so. */}
      <div className="md:hidden">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-sm font-semibold text-fw-strong">
            {activeStep.label}
          </p>
          <p className="shrink-0 font-mono text-[11px] tabular-nums text-fw-faint">
            Step {current + 1} of {STEPS.length}
          </p>
        </div>
        {activeStatus && (
          <p className="mt-0.5 text-[12px] text-fw-muted">{activeStatus}</p>
        )}
      </div>

      <div className="relative hidden overflow-x-auto pb-1 md:block">
        <ol className="flex min-w-160 items-start justify-between gap-2">
          {STEPS.map((step, i) => {
            const state = i < current ? 'done' : i === current ? 'active' : 'todo'
            const isHere = i === current
            const reachable = i <= maxReached
            const canGo = reachable && !isHere

            return (
              <li key={step.id} className="flex flex-1">
                <button
                  type="button"
                  disabled={!reachable}
                  // Announces the current step to a screen reader, which the
                  // colour of a circle does not.
                  aria-current={isHere ? 'step' : undefined}
                  title={canGo ? `Go to ${step.label}` : undefined}
                  onClick={() => canGo && onJump(i)}
                  className={[
                    'group flex w-full flex-col items-center rounded-lg px-1 py-1 text-center transition-colors',
                    // `focus:outline-none` needs the `focus-visible` ring
                    // beside it, or keyboard users get no ring at all.
                    'focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/60',
                    canGo && 'cursor-pointer hover:bg-fw-surface-2',
                    !reachable && 'cursor-default opacity-45',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                >
                  <span
                    className={[
                      'flex h-8 w-8 items-center justify-center rounded-full border text-[13px] font-semibold transition-colors',
                      state === 'done' && 'border-brand bg-brand text-white',
                      state === 'active' &&
                        'border-brand bg-brand text-white shadow-[0_0_0_4px_rgba(139,92,246,0.2)]',
                      state === 'todo' && 'border-fw-border bg-fw-surface text-fw-faint',
                      canGo && 'group-hover:border-brand',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                  >
                    {state === 'done' ? <CheckIcon /> : i + 1}
                  </span>

                  <span
                    className={`mt-1.5 text-xs font-semibold ${
                      state === 'todo' ? 'text-fw-faint' : 'text-fw-text'
                    } ${canGo ? 'group-hover:text-fw-strong group-hover:underline' : ''}`}
                  >
                    {step.label}
                  </span>

                  {/* Live where there's something live to say, the step's own
                      blurb where there isn't. Tabular figures so a changing
                      count doesn't shuffle the label above it. */}
                  <span
                    className={`mt-0.5 text-[11px] tabular-nums ${
                      isHere ? 'text-fw-muted' : 'text-fw-faint'
                    }`}
                  >
                    {status[step.id] ?? step.sub}
                  </span>
                </button>
              </li>
            )
          })}
        </ol>
      </div>

      {/* Progress rail — narrow screens only. Above `md` the row of circles
          already says how far along you are, and saying it twice would cost a
          band of height on every page of the wizard. */}
      <div className="mt-2.5 h-1 w-full overflow-hidden rounded-full bg-fw-surface-2 md:hidden">
        <div
          className="h-full rounded-full bg-linear-to-r from-brand-deep to-brand transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
    </nav>
  )
}
