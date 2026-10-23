import { useMemo } from 'react'
import type { ReactNode } from 'react'
import { Card, Button, PencilIcon, ChevronDown } from '../components/ui.js'
import PrPreview from './submit/PrPreview.js'
import SendPanel from './submit/SendPanel.js'
import { REPO } from '../lib/github.js'
import { titleize } from '../lib/format.js'
import { joinBlocks } from '../lib/blocks.js'
import { computeDiffRows } from '../lib/diff.js'
import {
  SPOTLIGHT_URL,
  STEWARDSHIP_URL,
  buildPrBody,
  buildPrTitle,
  frameworkStewards,
  pageContributors,
} from '../lib/prTemplate.js'
import type { PrAnswers } from '../lib/prTemplate.js'
import type { Sent, SubmitInput } from '../lib/send.js'
import type { StepId } from '../wizard/steps.js'
import type {
  AuthState,
  Block,
  ContributorDirectory,
  Frontmatter,
  PageEntry,
  Person,
} from '../lib/types.js'

// Step: say what you changed, check what goes out, and send it.
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
// What's left on the page is only what nobody else can do for them: say what
// they changed and why, and, where a framework has nobody looking after it,
// whether to put their hand up.
export default function SubmitStep({
  path,
  current,
  fm,
  contributorData,
  auth,
  justInstalled,
  blocks,
  originalBody,
  originalRaw,
  changedBlocks,
  dirty,
  note,
  onNote,
  answers,
  onAnswer,
  onGoTo,
  onSent,
}: {
  path: string
  current?: PageEntry
  fm: Frontmatter
  contributorData: ContributorDirectory
  auth: AuthState
  justInstalled: boolean
  blocks: Block[]
  originalBody: string
  originalRaw: string
  changedBlocks: number
  dirty: boolean
  note: string
  onNote: (note: string) => void
  answers: PrAnswers
  onAnswer: (id: keyof PrAnswers, on: boolean) => void
  onGoTo: (step: StepId) => void
  onSent: (sent: Sent) => void
}) {
  const contributors = pageContributors(fm, contributorData)
  const stewards = frameworkStewards(contributorData, current?.framework)
  const framework = current ? titleize(current.framework) : 'this framework'

  // What gets sent: the same title and body the preview draws, and the whole
  // file twice, as it loaded and as it is now. The frontmatter is carried over
  // byte for byte from the loaded file; only the body was ever editable.
  const request = (): SubmitInput => ({
    path,
    original: originalRaw,
    content: originalRaw.slice(0, originalRaw.length - originalBody.length) + joinBlocks(blocks),
    title: buildPrTitle(current),
    body: buildPrBody({ note, answers, current, contributors, stewards }),
  })

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

  // One column, in the order things happen: the note, who hears about it, what
  // goes out, any one-time setup, and the button. The pull request itself is
  // folded away above the button. Kept open beside the form the whole time, it
  // made the last screen of the wizard its busiest; behind a button, sending
  // felt like a leap of faith.
  return (
    <div className="mx-auto max-w-3xl">
      <WipBanner />

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
              What did you change, and why?{' '}
              <span className="text-xs font-normal text-fw-faint">Required</span>
            </label>
            <p id="cw-note-hint" className="mt-1 text-[13px] text-fw-muted">
              A couple of sentences. This is the first thing we read.
            </p>
            <textarea
              id="cw-note"
              required
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
            {contributors.length === 0 && stewards.length === 0 ? (
              <p className="mt-1 text-[13px] leading-relaxed text-fw-muted">
                Nobody is credited on this page yet, and this framework has no
                steward, so your suggestion comes straight to us.
              </p>
            ) : (
              <>
                <p className="mt-1 text-[13px] leading-relaxed text-fw-muted">
                  We mention them on your suggestion so it reaches people who can
                  act on it. You don&apos;t need to do anything.
                  {stewards.length > 0 && (
                    <>
                      {' '}A steward is the resident expert for a framework, and
                      their approval is needed before anything merges into it.{' '}
                      <Link href={SPOTLIGHT_URL}>See all stewards</Link>
                    </>
                  )}
                </p>
                <People contributors={contributors} stewards={stewards} />
              </>
            )}
          </section>

          {/* Only where there's a vacancy, and never pre-ticked: this is the
              one thing on the page nobody can be volunteered into. Tinted so it
              reads as an offer rather than as a box left unticked. */}
          {stewards.length === 0 && (
            <Offer
              on={!!answers.stewardInterest}
              onChange={(v) => onAnswer('stewardInterest', v)}
              title={`Put your hand up to look after ${framework}`}
              hint={
                <>
                  Nobody does yet. Stewards are the resident expert for one
                  framework, and there&apos;s no application: you contribute, and
                  say you&apos;re interested. Tick this and we&apos;ll pick it up
                  with your suggestion.{' '}
                  <Link href={STEWARDSHIP_URL}>What stewardship involves</Link>
                </>
              }
            />
          )}
        </div>

        <SendPanel
          auth={auth}
          justInstalled={justInstalled}
          noteMissing={!note.trim()}
          request={request}
          page={current ? titleize(current.name) : 'this page'}
          onSent={onSent}
          preview={
            <PreviewFold
              title={buildPrTitle(current)}
              added={added}
              removed={removed}
              login={auth.status === 'in' ? auth.user?.login : undefined}
            >
              <PrPreview
                current={current}
                user={auth.user}
                note={note}
                answers={answers}
                contributors={contributors}
                stewards={stewards}
                added={added}
                removed={removed}
              />
            </PreviewFold>
          }
        />
      </Card>
    </div>
  )
}

// What goes out, folded. Closed, it still says the essentials, so nobody has
// to open it to know what pressing Send does: the title, how much changed,
// where it goes and under whose name. Open, it's the pull request in full.
function PreviewFold({
  title,
  added,
  removed,
  login,
  children,
}: {
  title: string
  added: number
  removed: number
  login?: string
  children: ReactNode
}) {
  return (
    <details className="group rounded-lg border border-fw-border-soft bg-fw-surface-2/40">
      <summary className="flex cursor-pointer list-none items-start gap-2.5 px-3 py-2.5 [&::-webkit-details-marker]:hidden">
        <ChevronDown className="mt-0.5 shrink-0 -rotate-90 text-fw-faint transition-transform group-open:rotate-0 motion-reduce:transition-none" />
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] font-medium text-fw-text">
            What the maintainers will see
          </span>
          <span className="mt-0.5 block text-xs leading-relaxed break-words text-fw-faint">
            <span className="font-mono text-fw-muted">{title}</span> · 1 file,{' '}
            <span className="text-add">+{added}</span>{' '}
            <span className="text-del">−{removed}</span> · to{' '}
            <span className="font-mono">{REPO}</span>
            {login && <> as @{login}</>}
          </span>
        </span>
      </summary>
      <div className="px-3 pb-3">{children}</div>
    </details>
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

// A statement, not a question: who will be mentioned, by name and face, so
// "we'll tell them" is checkable rather than merely claimed. Each person once,
// with what's asked of them; a steward who is also credited on the page is one
// row, not two.
function People({ contributors, stewards }: { contributors: Person[]; stewards: Person[] }) {
  const credited = new Set(contributors.map((p) => p.slug))
  const stewardSlugs = new Set(stewards.map((p) => p.slug))
  const rows = [
    ...stewards.map((person) => ({ person, steward: true, credited: credited.has(person.slug) })),
    ...contributors
      .filter((p) => !stewardSlugs.has(p.slug))
      .map((person) => ({ person, steward: false, credited: true })),
  ]

  return (
    <ul className="mt-3 divide-y divide-fw-border-soft overflow-hidden rounded-lg border border-fw-border-soft">
      {rows.map(({ person, steward, credited }) => (
        <li key={person.slug} className="flex items-center gap-3 bg-fw-surface-2/40 px-3 py-2.5">
          <img
            src={person.avatar}
            alt=""
            className="h-7 w-7 shrink-0 rounded-full border border-fw-border object-cover"
            onError={(e) => {
              e.currentTarget.style.visibility = 'hidden'
            }}
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] text-fw-text">
              {person.name} <span className="text-fw-faint">@{person.slug}</span>
            </p>
            <p className="text-xs text-fw-faint">
              {steward
                ? credited
                  ? 'The framework’s steward, also credited on this page'
                  : 'The framework’s steward'
                : 'Credited on this page'}
            </p>
          </div>
          <span
            className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${
              steward ? 'bg-brand-soft text-brand-hover' : 'bg-fw-surface-2 text-fw-faint'
            }`}
          >
            {steward ? 'Asked to review' : 'Kept in the loop'}
          </span>
        </li>
      ))}
    </ul>
  )
}

// The one question on the page: an offer to look after a framework nobody
// looks after yet.
function Offer({
  on,
  onChange,
  title,
  hint,
}: {
  on: boolean
  onChange: (on: boolean) => void
  title: string
  hint: ReactNode
}) {
  return (
    <label className="flex cursor-pointer gap-3 rounded-lg border border-brand/25 bg-brand-soft/25 p-3 transition-colors hover:border-brand/50">
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
