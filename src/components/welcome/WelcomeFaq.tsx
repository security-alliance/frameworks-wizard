import { Card, ChevronDown } from '../ui.js'

// The questions people don't ask.
//
// A landing page has to be read top to bottom, which means every reassurance it
// carries is one more paragraph between the visitor and the button. The things
// that actually stop someone — do I need to know git, what if it gets rejected,
// have I already committed to something by clicking — aren't objections to the
// pitch, they're worries underneath it, and they only need answering for the
// people who have them.
//
// Which is also why it sits beside the page rather than at the foot of it. In
// the main column it would be six more things to scroll past on the way to the
// button, read by nobody who wasn't worried. Alongside, and sticky, it stays
// available at whatever point in the page the doubt actually turns up, and
// costs nothing to anyone who never has it.
//
// Native <details>, so it works with the keyboard and with a screen reader
// without any of that being this file's problem.

interface Faq {
  q: string
  a: string
}

const FAQS: Faq[] = [
  {
    q: 'Do I need to know GitHub, or git?',
    a: 'No. You need a GitHub account, which is free and takes a minute to make. There is no branch to name, no commit to write and no command to run. The first time you send, the wizard walks you through two short steps on GitHub to set up your own copy of the docs; after that, it does the rest, and you never see it.',
  },
  {
    q: 'What exactly happens when I press send?',
    a: 'The wizard opens a pull request: a suggested change to a page, filed under your name, that we can read and accept with one click. It goes into the queue alongside every other suggestion the project gets. Nothing appears on the site until one of us approves it.',
  },
  {
    q: 'Can I change my mind once I start?',
    a: 'Yes. Nothing leaves your browser until the last step, where you press send yourself. Up to that point you can close the tab and nothing has happened, and your draft is kept in this browser, so you can come back to a half-finished edit and carry on where you stopped.',
  },
  {
    q: 'What if my suggestion is turned down?',
    a: 'Then it is turned down, and nothing else follows from it. More often we will ask a question or suggest a change first, because we want your contribution to land. You are free to come back and suggest something else either way.',
  },
  {
    q: 'What becomes public?',
    a: 'The suggestion is filed from your GitHub account, so what shows up is whatever your GitHub profile already shows publicly, usually your username and avatar. Accepted changes credit that same account on the page itself.',
  },
  {
    q: 'What am I allowed to edit?',
    a: 'Any existing page, from a single broken link to a section rewritten by someone who knows the subject better than whoever wrote it first. Creating brand new pages is not wired up yet, but it is on the way.',
  },
]

export default function WelcomeFaq({
  /** How many questions to show. The rail can't hold six without becoming the
   *  tallest thing on the page; the first three are the ones that actually stop
   *  people, and two of the rest are already answered by the demo and the hero. */
  limit,
}: {
  limit?: number
} = {}) {
  const shown = limit ? FAQS.slice(0, limit) : FAQS

  return (
    <Card className="fw-faq px-5 py-5">
      <h2 className="text-[13px] font-semibold text-fw-strong">
        Questions people usually have
      </h2>

      <div className="mt-1.5 divide-y divide-fw-border-soft">
        {shown.map(({ q, a }) => (
          <details key={q} className="group">
            <summary className="flex cursor-pointer list-none items-start gap-2 py-2.5 text-[13px] font-medium leading-snug text-fw-text hover:text-fw-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/60">
              <ChevronDown className="mt-0.5 shrink-0 text-fw-faint transition-transform group-open:rotate-180" />
              {q}
            </summary>
            <p className="pb-3 pl-6 pr-1 text-[12.5px] leading-relaxed text-fw-muted">
              {a}
            </p>
          </details>
        ))}
      </div>
    </Card>
  )
}
