import { useMemo } from 'react'
import type { ReactNode } from 'react'
import { Card, Button, PencilIcon } from '../components/ui.js'
import PrPreview from './submit/PrPreview.js'
import { titleize } from '../lib/format.js'
import { joinBlocks } from '../lib/blocks.js'
import { computeDiffRows } from '../lib/diff.js'
import {
  DISCORD_URL,
  SPOTLIGHT_URL,
  STEWARDSHIP_URL,
  frameworkStewards,
  pageContributors,
} from '../lib/prTemplate.js'
import type { PrAnswers } from '../lib/prTemplate.js'
import type { StepId } from '../wizard/steps.js'
import type {
  AuthUser,
  Block,
  ContributorDirectory,
  Frontmatter,
  PageEntry,
  Person,
} from '../lib/types.js'

// Step: say what you changed, see what gets sent, then send it.
//
// Not the PR template transliterated. The template asks a contributor to tag
// people from an attribution list they can't see, to find a steward they have
// no way of identifying, and to update a config file this wizard never touches.
// The people are shown by name and face and the wizard does the tagging, the
// steward is looked up and named, and the config question is gone.
//
// The tagging isn't asked about at all — see the note at the top of
// prTemplate.ts for why a checkbox is the wrong shape for a rule the project
// already has. Instead, the pull request is drawn out in full before it's sent,
// so "we'll mention them for you" is something the contributor can read rather
// than something they have to trust.
//
// What's left as a question is only what nobody else can answer for them:
// whether to ask the wider community, whether to put their hand up for a
// framework nobody looks after, and whether they've read their own work back.
export default function SubmitStep({
  current,
  fm,
  contributorData,
  user,
  blocks,
  originalBody,
  changedBlocks,
  dirty,
  note,
  onNote,
  answers,
  onAnswer,
  onGoTo,
}: {
  current?: PageEntry
  fm: Frontmatter
  contributorData: ContributorDirectory
  user?: AuthUser
  blocks: Block[]
  originalBody: string
  changedBlocks: number
  dirty: boolean
  note: string
  onNote: (note: string) => void
  answers: PrAnswers
  onAnswer: (id: keyof PrAnswers, on: boolean) => void
  onGoTo: (step: StepId) => void
}) {
  const contributors = pageContributors(fm, contributorData)
  const stewards = frameworkStewards(contributorData, current?.framework)
  const framework = current ? titleize(current.framework) : 'this framework'

  // Line counts for the preview. Computed here rather than in App because this
  // step is the only place they're wanted, and App would recompute them on
  // every keystroke in the editor to serve a screen nobody is looking at.
  const { added, removed } = useMemo(() => {
    const d = computeDiffRows(originalBody, joinBlocks(blocks))
    return { added: d.added ?? 0, removed: d.removed ?? 0 }
  }, [originalBody, blocks])

  // Nothing to send. Rendering the form here would leave every field fillable
  // and the note typeable, all of it attached to no change whatsoever. The only
  // honest thing this screen can offer is the way back.
  if (!dirty) {
    return (
      <div className="mx-auto max-w-3xl">
        <WipBanner />
        <Card className="px-8 py-10 text-center">
          <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-full bg-fw-surface-2 text-fw-faint">
            <PencilIcon />
          </div>
          <h2 className="text-lg font-semibold text-fw-strong">
            Nothing to send yet
          </h2>
          <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-fw-muted">
            You haven&apos;t changed anything
            {current && <> in {titleize(current.name)}</>}. Make an edit first
            and this step will show you exactly what gets sent.
          </p>
          <Button className="mt-6" onClick={() => onGoTo('edit')}>
            Back to writing
          </Button>
        </Card>
      </div>
    )
  }

  // Two columns, and the reason is the preview.
  //
  // A live preview is only worth building if you can watch it update: type a
  // sentence, see it land in the thing being sent. Below the form it would be a
  // screen and a half from the box you're typing in, so it sits beside the form
  // instead and sticks to the viewport however far down the form you scroll.
  //
  // Under `lg` it stacks back to one column in the order that makes sense on a
  // phone — fill it in, see what it produced, then send — which is why the send
  // controls are their own bar below both columns rather than the foot of the
  // left one. On a wide screen that bar also gives the last action in the whole
  // wizard the full width to sit in.
  return (
    <div className="mx-auto max-w-6xl">
      <WipBanner />

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_28rem]">
        <Card className="p-0">
          <div className="border-b border-fw-border px-6 py-4">
            <h2 className="text-lg font-semibold text-fw-strong">Send your suggestion</h2>
            <p className="mt-1 text-sm text-fw-muted">
              {changedBlocks} section{changedBlocks === 1 ? '' : 's'} changed
              {current && <> in {titleize(current.name)}</>}. We read this
              ourselves before anything appears on the site.
            </p>
          </div>

          <div className="space-y-8 px-6 py-6">
            <section>
              <label htmlFor="cw-note" className="text-sm font-semibold text-fw-strong">
                What did you change, and why?
              </label>
              <p id="cw-note-hint" className="mt-1 text-[13px] text-fw-muted">
                A couple of sentences. This is the first thing we read.
              </p>
              <textarea
                id="cw-note"
                aria-describedby="cw-note-hint cw-note-foot"
                value={note}
                onChange={(e) => onNote(e.target.value)}
                rows={5}
                placeholder="The link to the OWASP cheat sheet was dead, so I pointed it at the current one and reworded the sentence around it."
                className="mt-2.5 w-full resize-y rounded-lg border border-fw-border bg-fw-surface-2 px-3 py-2.5 text-sm leading-relaxed text-fw-text placeholder:text-fw-faint focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
              />
              {/* Two things worth saying once, at the moment of writing rather
                  than in a policy page nobody opens: it's public, and it's safe. */}
              <p id="cw-note-foot" className="mt-2 text-xs leading-relaxed text-fw-faint">
                This is published on GitHub under your name, so write it for
                strangers. It&apos;s kept with your draft in this browser, so
                closing the tab won&apos;t lose it.
              </p>
            </section>

            <section>
              <h3 className="text-sm font-semibold text-fw-strong">Who we&apos;ll tell</h3>
              <p className="mt-1 text-[13px] text-fw-muted">
                We mention these people on your suggestion so it reaches someone
                who can act on it. You don&apos;t need to do anything.
              </p>

              <div className="mt-3 space-y-2">
                {contributors.length > 0 && (
                  <Told
                    title={`The ${contributors.length === 1 ? 'person' : 'people'} credited on this page`}
                    hint="They wrote or reviewed it, and usually have context you don’t."
                    people={contributors}
                  />
                )}

                {stewards.length > 0 && (
                  <Told
                    title={`${framework}’s steward`}
                    hint={
                      <>
                        The resident expert for {framework}. Their approval is
                        needed before anything merges into it.{' '}
                        <Link href={SPOTLIGHT_URL}>See all stewards</Link>
                      </>
                    }
                    people={stewards}
                  />
                )}

                {contributors.length === 0 && stewards.length === 0 && (
                  <p className="rounded-lg border border-fw-border-soft bg-fw-surface-2/40 p-3 text-[13px] leading-relaxed text-fw-muted">
                    Nobody is credited on this page yet, and {framework} has no
                    steward, so this one comes straight to us.
                  </p>
                )}
              </div>
            </section>

            <section>
              <h3 className="text-sm font-semibold text-fw-strong">
                Anything else you&apos;d like to do?
              </h3>
              <p className="mt-1 text-[13px] text-fw-muted">
                Both optional, and both off unless you say otherwise.
              </p>

              <div className="mt-3 space-y-2">
                <Choice
                  on={!!answers.discord}
                  onChange={(v) => onAnswer('discord', v)}
                  title="Ask the wider community for feedback"
                  hint={
                    <>
                      We&apos;ll share it in Discord. Worth it for judgement
                      calls, or anything you&apos;re not certain about.{' '}
                      <Link href={DISCORD_URL}>Our Discord</Link>
                    </>
                  }
                />

                {/* Only where there's a vacancy, and never pre-ticked: this is
                    the one thing on the page nobody can be volunteered into.
                    Tinted so it reads as an offer rather than as a box left
                    unticked. */}
                {stewards.length === 0 && (
                  <Choice
                    tone="invite"
                    on={!!answers.stewardInterest}
                    onChange={(v) => onAnswer('stewardInterest', v)}
                    title={`Put your hand up to look after ${framework}`}
                    hint={
                      <>
                        Nobody does yet. Stewards are the resident expert for one
                        framework, and there&apos;s no application: you
                        contribute, and say you&apos;re interested. Tick this and
                        we&apos;ll pick it up with your suggestion.{' '}
                        <Link href={STEWARDSHIP_URL}>What stewardship involves</Link>
                      </>
                    }
                  />
                )}
              </div>
            </section>
          </div>
        </Card>

        {/* The artifact, deliberately not in a Card: the left column is the
            wizard talking, and this is the object itself, sitting next to it. */}
        <aside className="lg:sticky lg:top-6 lg:max-h-[calc(100vh-3rem)] lg:overflow-y-auto">
          <h3 className="text-sm font-semibold text-fw-strong">
            What we&apos;ll send
          </h3>
          <p className="mt-1 mb-3 text-[13px] text-fw-muted">
            Your suggestion as the maintainers will see it. It updates as you
            write.
          </p>
          <PrPreview
            current={current}
            user={user}
            note={note}
            answers={answers}
            contributors={contributors}
            stewards={stewards}
            added={added}
            removed={removed}
          />
        </aside>
      </div>

      <Card className="mt-6 flex flex-col gap-5 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <label className="flex cursor-pointer gap-3">
            <input
              type="checkbox"
              checked={!!answers.typos}
              onChange={(e) => onAnswer('typos', e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 accent-brand"
            />
            <span>
              <span className="block text-[13px] font-medium text-fw-text">
                I&apos;ve read my changes back
              </span>
              <span className="mt-0.5 block text-xs leading-relaxed text-fw-faint">
                The last step shows them highlighted in the page.
              </span>
            </span>
          </label>
          <button
            type="button"
            onClick={() => onGoTo('review')}
            className="mt-1.5 ml-7 text-xs font-medium text-brand-hover underline"
          >
            Take me back to check them
          </button>
        </div>

        <div className="flex shrink-0 flex-col items-center">
          <Coming label="Wiring this up. Will be available soon.">
            <Button disabled className="pointer-events-none">
              Send for review
            </Button>
          </Coming>
          {/* The same sentence in plain sight. A tooltip that only exists on
              hover is a tooltip that doesn't exist on a phone, or to anyone
              reading with a keyboard. */}
          <p className="mt-2.5 text-center text-xs text-fw-faint">
            Not wired up yet. Nothing leaves this browser.
          </p>
        </div>
      </Card>
    </div>
  )
}

// Said once, at the top, before anyone forms an opinion about the layout: this
// screen is still being built. Cheaper than fielding the same question from
// every colleague who opens it.
function WipBanner() {
  return (
    <div className="mb-4 flex gap-2.5 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3">
      <span aria-hidden className="mt-px shrink-0 text-amber-500">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M12 9v4M12 17h.01" />
          <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
        </svg>
      </span>
      <p className="text-[13px] leading-relaxed text-fw-muted">
        <span className="font-semibold text-amber-500">Work in progress.</span>{' '}
        This step isn&apos;t final. 
        The layout and the wording could still change.
      </p>
    </div>
  )
}

// A statement, not a question. The people who will be mentioned, by name and
// face, so "we'll tell them" is checkable rather than merely claimed.
function Told({
  title,
  hint,
  people,
}: {
  title: string
  hint: ReactNode
  people: Person[]
}) {
  return (
    <div className="rounded-lg border border-fw-border-soft bg-fw-surface-2/40 p-3">
      <p className="text-[13px] font-medium text-fw-text">{title}</p>
      <p className="mt-0.5 text-xs leading-relaxed text-fw-faint">{hint}</p>
      <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1.5">
        {people.map((p) => (
          <li key={p.slug} className="flex items-center gap-1.5">
            <img
              src={p.avatar}
              alt=""
              className="h-5 w-5 rounded-full border border-fw-border object-cover"
              onError={(e) => {
                e.currentTarget.style.visibility = 'hidden'
              }}
            />
            <span className="text-xs text-fw-text">{p.name}</span>
            <span className="text-xs text-fw-faint">@{p.slug}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

// `tone="invite"` is for the one question nobody can be volunteered into.
function Choice({
  on,
  onChange,
  title,
  hint,
  tone,
}: {
  on: boolean
  onChange: (on: boolean) => void
  title: string
  hint: ReactNode
  tone?: 'invite'
}) {
  const skin =
    tone === 'invite'
      ? 'border-brand/25 bg-brand-soft/25 hover:border-brand/50'
      : 'border-fw-border-soft bg-fw-surface-2/40 hover:border-fw-border'
  return (
    <label className={`flex cursor-pointer gap-3 rounded-lg border p-3 transition-colors ${skin}`}>
      <input
        type="checkbox"
        checked={on}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0 accent-brand"
      />
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-medium text-fw-text">{title}</span>
        <span className="mt-0.5 block text-xs leading-relaxed text-fw-faint">{hint}</span>
      </span>
    </label>
  )
}

// A tooltip over something switched off.
//
// A disabled button swallows its own pointer events, so `title` on it never
// fires and neither does `:hover` — hence the wrapper, and `pointer-events-none`
// on the child so the hover lands here instead.
//
// It is hover-only by construction: a disabled button can't take focus, so
// there is no keyboard route to this text and there shouldn't need to be. The
// line printed under the button says the same thing to everyone.
function Coming({ label, children }: { label: string; children: ReactNode }) {
  return (
    <span className="group relative inline-flex">
      {children}
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 w-64 -translate-x-1/2 rounded-lg border border-fw-border bg-fw-surface px-3 py-2 text-center text-xs leading-relaxed text-fw-muted opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100 motion-reduce:transition-none"
      >
        {label}
      </span>
    </span>
  )
}

const Link = ({ href, children }: { href: string; children: ReactNode }) => (
  <a
    href={href}
    target="_blank"
    rel="noopener noreferrer"
    className="text-brand-hover underline"
    onClick={(e) => e.stopPropagation()}
  >
    {children}
  </a>
)
