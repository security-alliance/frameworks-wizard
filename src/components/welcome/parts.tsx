import { Button, UsersIcon, BranchIcon, ArrowRight } from '../ui.js'
import type { IconProps } from '../ui.js'
import type { FC } from 'react'

// The pieces the welcome page is built from, kept apart from the layout in
// WelcomeStep so the words can be changed without touching the arrangement.

/* ── hero ──────────────────────────────────────────────────────────────── */

export function Hero() {
  return (
    <div className="text-center">
      <span className="inline-flex items-center gap-2 rounded-full border border-fw-border bg-fw-surface-2 px-3 py-1 text-xs font-medium text-fw-muted">
        <span className="h-1.5 w-1.5 rounded-full bg-brand" />
        SEAL Frameworks · Contribute
      </span>
      <h1 className="mt-5 text-3xl font-bold tracking-tight text-fw-strong sm:text-4xl">
        What you know is worth writing down.
      </h1>
      <p className="mx-auto mt-3 max-w-xl text-[15px] leading-relaxed text-fw-muted">
        These pages exist because people before you wrote down what they&apos;d
        learned the hard way. Edit any page like a document, and we&apos;ll turn
        what you write into a proper suggestion for review.
      </p>
    </div>
  )
}

/* ── the claims ────────────────────────────────────────────────────────── */

interface ValueProp {
  icon: FC<IconProps>
  title: string
  body: string
}

// Only two.
//
// "Write, don't code" and "nothing goes live by accident" are both answered
// better a few centimetres away: the demo shows the first rather than asserting
// it, and the FAQ's second question covers the second at more length than a
// card can. Four cards of claims is also the block a reader scans as shapes
// instead of reading, so these are the two saying something nothing else on
// the page does.
//
// "Your name stays on it" is the one to improve next: it's the payoff of the
// whole flow and it's a sentence claiming something, where the attribution row
// that really renders on a page would be a picture of it.
const VALUE_PROPS: ValueProp[] = [
  {
    icon: UsersIcon,
    title: 'Your name stays on it',
    body: 'Accepted changes credit your GitHub account on the page itself.',
  },
  {
    icon: BranchIcon,
    title: 'Small fixes help, depth helps more',
    body: 'A dead link is worth fixing. A section rewritten by someone who knows the subject is worth far more.',
  },
]

export function ValueProps({ className = '' }: { className?: string }) {
  return (
    <div className={`grid gap-4 sm:grid-cols-2 ${className}`}>
      {VALUE_PROPS.map(({ icon: Icon, title, body }) => (
        <div
          key={title}
          className="flex gap-3 rounded-xl border border-fw-border-soft bg-fw-surface-2/50 p-4"
        >
          <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand-hover">
            <Icon />
          </span>
          <div>
            <h3 className="text-sm font-semibold text-fw-strong">{title}</h3>
            <p className="mt-1 text-[13px] leading-relaxed text-fw-muted">{body}</p>
          </div>
        </div>
      ))}
    </div>
  )
}

/* ── what to edit ──────────────────────────────────────────────────────── */

const CONTRIBUTIONS = [
  'Fix a typo, or a link that goes nowhere',
  'Rewrite a paragraph that reads badly',
  'Add an example, a tool, or a source worth citing',
  'Update advice that has quietly aged out',
]

export function GoodFirstEdits({ className = '' }: { className?: string }) {
  return (
    <div
      className={`rounded-xl border border-brand/25 bg-brand-soft/40 p-5 ${className}`}
    >
      <h3 className="text-sm font-semibold text-brand-hover">Good first edits</h3>
      <ul className="mt-3 grid gap-2 sm:grid-cols-2">
        {CONTRIBUTIONS.map((c) => (
          <li key={c} className="flex items-start gap-2 text-[13px] text-fw-text">
            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />
            {c}
          </li>
        ))}
      </ul>
    </div>
  )
}

/* ── the button ────────────────────────────────────────────────────────── */

export function StartCta({
  onNext,
  size = 'lg',
  footnote = true,
}: {
  onNext: () => void
  size?: 'lg' | 'sm'
  footnote?: boolean
}) {
  return (
    <div className="flex flex-col items-center text-center">
      <Button
        onClick={onNext}
        className={size === 'lg' ? 'px-7 py-3 text-base' : ''}
      >
        Start editing <ArrowRight />
      </Button>
      {/* The timing lives in the rail, where it's stated with the caveat that
          makes it true. Repeating "about five minutes" here would be the
          unqualified version of a claim the rail qualifies. */}
      {footnote && (
        <p className="mt-3 text-xs text-fw-faint">
          Existing pages for now. Creating new ones is on the way.
        </p>
      )}
    </div>
  )
}

/* ── the path, compressed ──────────────────────────────────────────────── */

// The path, without restating the steps the stepper already names 200px higher
// up. What's here is what the stepper doesn't say: how long each part takes,
// which is what makes "about five minutes" believable, and that the story
// carries on after the send button.
const PATH = [
  { action: 'Sign in with GitHub', time: '10 sec' },
  { action: 'Pick a page', time: '1 min' },
  { action: 'Write', time: 'up to you' },
  { action: 'Read it back', time: '1 min' },
  { action: 'Send it', time: '2 min' },
]

export function MiniPath() {
  return (
    <div>
      {/* A box in a rail is read at whatever moment someone glances at it, in
          no particular order, so the heading carries its own claim rather than
          referring to one ("Where the five minutes go" would point at a number
          the reader may not have met yet). */}
      <h2 className="text-[13px] font-semibold text-fw-strong">How long it takes</h2>

      <ol className="mt-2.5 space-y-1.5">
        {PATH.map(({ action, time }) => (
          <li
            key={action}
            className="flex items-baseline justify-between gap-3 text-[12.5px] text-fw-text"
          >
            <span>{action}</span>
            <span className="shrink-0 font-mono text-[10.5px] text-fw-faint">
              {time}
            </span>
          </li>
        ))}
      </ol>

      {/* Said plainly, because the five minutes never included the writing and
          a list totalling "10 sec, 1 min, up to you, 1 min, 2 min" quietly
          admits it. Better to be the one who says so. */}
      <p className="mt-3 border-t border-fw-border-soft pt-2.5 text-[11.5px] leading-relaxed text-fw-faint">
        Five minutes of wizard. The writing takes as long as it takes.
      </p>

      {/* The one beat of "what happens after you send" this layout carries:
          the question the rest of the page answers least. */}
      <div className="mt-3.5 rounded-lg bg-fw-surface-2/60 px-3 py-2.5">
        <div className="text-[10px] font-semibold uppercase tracking-wide text-fw-faint">
          Then it&apos;s our turn
        </div>
        <p className="mt-1 text-[12px] leading-relaxed text-fw-muted">
          We review it, usually within a week, and may ask a question
          before accepting. Nothing reaches the site until we do.
        </p>
      </div>
    </div>
  )
}
