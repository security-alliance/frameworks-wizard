import { useMemo } from 'react'
import type { ReactNode } from 'react'
import { Card, Button, PencilIcon, ChevronDown, PlusIcon } from '../components/ui.js'
import PrPreview from './submit/PrPreview.js'
import SendPanel from './submit/SendPanel.js'
import { REPO, pageTrail } from '../lib/github.js'
import { changes, useDraftPages, withBody } from '../lib/suggestion.js'
import type { BuiltPage } from '../lib/suggestion.js'
import {
  SPOTLIGHT_URL,
  STEWARDSHIP_URL,
  buildPrBody,
  buildPrTitle,
  frameworkStewards,
  pageContributors,
} from '../lib/prTemplate.js'
import type { PrAnswers, PrBodyInput, StewardGroup } from '../lib/prTemplate.js'
import type { DraftSummary } from '../lib/drafts.js'
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
// A suggestion is every draft the contributor has open, each ticked by
// default, sent as one pull request with one note. Unticking a page keeps it
// as a draft, to send on its own later.
//
// Not the PR template transliterated. The template asks a contributor to find
// a steward they have no way of identifying and to update a config file this
// wizard never touches. The steward is looked up and named, and the config
// question is gone. See the note at the top of prTemplate.ts. The pull request
// is drawn out in full before it's sent, so "we'll ask the steward for you" is
// something the contributor can read rather than something they have to trust.
//
// What's left on the page is only what nobody else can do for them: which
// pages belong together, what they changed and why, and, where a framework has
// nobody looking after it, whether to put their hand up.
export default function SubmitStep({
  path,
  current,
  fm,
  contributorData,
  auth,
  authError,
  justInstalled,
  blocks,
  originalBody,
  originalRaw,
  dirty,
  drafts,
  pageEntry,
  note,
  onNote,
  answers,
  onAnswer,
  leftOut,
  onTick,
  onGoTo,
  onAddPage,
  onCheckPage,
  onSent,
}: {
  path: string
  current?: PageEntry
  fm: Frontmatter
  contributorData: ContributorDirectory
  auth: AuthState
  /** A sign-in that just failed, as GitHub's callback reported it. */
  authError: string | null
  justInstalled: boolean
  blocks: Block[]
  originalBody: string
  originalRaw: string
  dirty: boolean
  /** Every draft in this browser; the open page's, if any, is among them. */
  drafts: DraftSummary[]
  pageEntry: (path: string) => PageEntry
  note: string
  onNote: (note: string) => void
  answers: PrAnswers
  onAnswer: (id: keyof PrAnswers, on: boolean) => void
  /** Drafts unticked for this suggestion. */
  leftOut: string[]
  onTick: (path: string, on: boolean) => void
  onGoTo: (step: StepId) => void
  /** Off to the picker, to add another page to this change. */
  onAddPage: () => void
  /** Open a page of the suggestion on the Check step. */
  onCheckPage: (path: string) => void
  onSent: (sent: Sent) => void
}) {
  const others = useDraftPages(drafts, path)

  // The open page first, as it is on screen, then every other draft.
  const rows = useMemo<BuiltPage[]>(() => {
    const out: BuiltPage[] = []
    if (dirty) {
      out.push({
        path,
        status: 'ready',
        original: originalRaw,
        content: withBody(originalRaw, originalBody, blocks),
        fm,
        ...changes(originalBody, blocks),
      })
    }
    for (const d of drafts) {
      if (d.path === path) continue
      out.push(
        others[d.path] ?? { path: d.path, status: 'loading', added: 0, removed: 0, sections: d.edits },
      )
    }
    return out
  }, [dirty, path, originalRaw, originalBody, blocks, fm, drafts, others])

  const ticked = rows.filter((r) => r.status === 'ready' && !leftOut.includes(r.path))
  const pages = ticked.map((r) => ({ page: pageEntry(r.path), added: r.added, removed: r.removed }))

  // Each framework once, in the order its first page appears.
  const frameworks = [...new Map(pages.map((p) => [p.page.framework, p.page.frameworkTitle]))]
  const stewards: StewardGroup[] = frameworks.map(([fw, title]) => ({
    framework: title,
    people: frameworkStewards(contributorData, fw),
  }))
  const credited = uniquePeople(ticked.flatMap((r) => pageContributors(r.fm, contributorData)))
  // The offer is for the first framework in the suggestion with nobody
  // looking after it, which is the open page's whenever it has changes.
  const vacancy = stewards.find((g) => g.people.length === 0)?.framework ?? null

  const bodyInput: PrBodyInput = {
    note,
    pages: pages.map((p) => p.page),
    stewards,
    credited,
    volunteer: answers.stewardInterest ? vacancy : null,
  }
  const title = buildPrTitle(pages)

  // What gets sent: the same title and body the preview draws, and each page
  // twice, as it loaded and as it is now.
  const request = (): SubmitInput => ({
    files: ticked.map((r) => ({ path: r.path, original: r.original!, content: r.content! })),
    title,
    body: buildPrBody(bodyInput),
  })

  // Nothing to send. Rendering the form here would leave every field fillable
  // and the note typeable, all of it attached to no change whatsoever. The only
  // honest thing this screen can offer is the way back.
  if (rows.length === 0) {
    return (
      <div className="mx-auto max-w-3xl">
        <Card className="px-8 py-10 text-center">
          <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-full bg-fw-surface-2 text-fw-faint">
            <PencilIcon />
          </div>
          <h2 className="text-lg font-semibold text-fw-strong">
            Nothing to send yet
          </h2>
          <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-fw-muted">
            You haven&apos;t changed anything
            {current && <> in {current.title}</>}. Make an edit first
            and this step will show you exactly what gets sent.
          </p>
          <Button className="mt-6" onClick={() => onGoTo('edit')}>
            Back to writing
          </Button>
        </Card>
      </div>
    )
  }

  const sections = ticked.reduce((n, r) => n + r.sections, 0)
  const added = pages.reduce((n, p) => n + p.added, 0)
  const removed = pages.reduce((n, p) => n + p.removed, 0)
  const nameOf = (p: string) => pageEntry(p).title
  const blocked =
    ticked.length === 0
      ? 'Tick at least one page above.'
      : !note.trim()
        ? 'Write a note above first. It’s the first thing the maintainers read.'
        : null

  // One column, in the order things happen: which pages, the note, who hears
  // about it, what goes out, any one-time setup, and the button. The pull
  // request itself is folded away above the button.
  return (
    <div className="mx-auto max-w-3xl">
      <Card className="p-0">
        <div className="border-b border-fw-border px-6 py-4">
          <h2 className="text-lg font-semibold text-fw-strong">Send your suggestion</h2>
          <p className="mt-1 text-sm text-fw-muted">
            {sections} section{sections === 1 ? '' : 's'} changed
            {ticked.length === 1 ? <> in {nameOf(ticked[0].path)}</> : <> across {ticked.length} pages</>}
            . We read this ourselves before anything appears on the site.
          </p>
        </div>

        <div className="space-y-8 px-6 py-6">
          <section>
            <h3 className="text-sm font-semibold text-fw-strong">Pages in this suggestion</h3>
            <p className="mt-1 text-[0.8125rem] leading-relaxed text-fw-muted">
              {rows.length > 1
                ? 'Send pages together only when they’re part of the same change, like fixing the same mistake everywhere it appears, or adding links to one topic across frameworks. Unrelated changes are easier to review apart: untick a page to keep it as a draft and send it on its own.'
                : 'Fixing the same thing on another page? Add it here and it goes out in the same suggestion.'}
            </p>
            <ul className="mt-3 divide-y divide-fw-border-soft overflow-hidden rounded-lg border border-fw-border-soft">
              {rows.map((r) => (
                <PageRow
                  key={r.path}
                  row={r}
                  label={pageTrail(pageEntry(r.path))}
                  open={r.path === path}
                  on={r.status === 'ready' && !leftOut.includes(r.path)}
                  onTick={(on) => onTick(r.path, on)}
                  onCheck={() => (r.path === path ? onGoTo('review') : onCheckPage(r.path))}
                />
              ))}
            </ul>
            <Button variant="outline" className="mt-3" onClick={onAddPage}>
              <PlusIcon width={14} height={14} /> Add another page to this change
            </Button>
          </section>

          <section>
            <label htmlFor="cw-note" className="text-sm font-semibold text-fw-strong">
              What did you change, and why?{' '}
              <span className="text-xs font-normal text-fw-faint">Required</span>
            </label>
            <p id="cw-note-hint" className="mt-1 text-[0.8125rem] text-fw-muted">
              A couple of sentences{rows.length > 1 && ', covering every page you send'}. This is
              the first thing we read.
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
              strangers. It&apos;s kept with your drafts in this browser, so
              closing the tab won&apos;t lose it.
            </p>
          </section>

          <section>
            <h3 className="text-sm font-semibold text-fw-strong">Who we&apos;ll tell</h3>
            {stewards.every((g) => g.people.length === 0) ? (
              <p className="mt-1 text-[0.8125rem] leading-relaxed text-fw-muted">
                {stewards.length > 1 ? 'These frameworks have' : 'This framework has'} no
                steward yet, so your suggestion comes straight to us.
              </p>
            ) : (
              <>
                <p className="mt-1 text-[0.8125rem] leading-relaxed text-fw-muted">
                  We ask the steward to review it, so it reaches someone who can
                  act on it. You don&apos;t need to do anything. A steward is the
                  resident expert for a framework, and their approval is needed
                  before anything merges into it.{' '}
                  <Link href={SPOTLIGHT_URL}>See all stewards</Link>
                </p>
                <People groups={stewards} />
              </>
            )}
            {credited.length > 0 && (
              <p className="mt-2 text-xs leading-relaxed text-fw-faint">
                Also credited on {ticked.length === 1 ? 'this page' : 'these pages'}, named in
                the pull request but not notified:{' '}
                {credited.map((p) => p.name).join(', ')}.
              </p>
            )}
          </section>

          {/* Only where there's a vacancy, and never pre-ticked: this is the
              one thing on the page nobody can be volunteered into. Tinted so it
              reads as an offer rather than as a box left unticked. */}
          {vacancy && (
            <Offer
              on={!!answers.stewardInterest}
              onChange={(v) => onAnswer('stewardInterest', v)}
              title={`Put your hand up to look after ${vacancy}`}
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
          authError={authError}
          justInstalled={justInstalled}
          blocked={blocked}
          request={request}
          pages={ticked.map((r) => nameOf(r.path))}
          nameOf={nameOf}
          onSent={onSent}
          preview={
            <PreviewFold
              title={title}
              files={pages.length}
              added={added}
              removed={removed}
              login={auth.status === 'in' ? auth.user?.login : undefined}
            >
              <PrPreview
                title={title}
                user={auth.user}
                body={bodyInput}
                files={pages.map((p) => ({ rel: p.page.rel, added: p.added, removed: p.removed }))}
              />
            </PreviewFold>
          }
        />
      </Card>
    </div>
  )
}

/** Each person once, in the order first met. */
function uniquePeople(people: Person[]): Person[] {
  return [...new Map(people.map((p) => [p.slug, p])).values()]
}

// One page of the suggestion: tick it in or out, and open it to check.
function PageRow({
  row,
  label,
  open,
  on,
  onTick,
  onCheck,
}: {
  row: BuiltPage
  label: string
  open: boolean
  on: boolean
  onTick: (on: boolean) => void
  onCheck: () => void
}) {
  const ready = row.status === 'ready'
  const sub =
    row.status === 'loading' ? (
      'Loading…'
    ) : row.status === 'stale' ? (
      <span className="text-amber-500">
        This page changed since you wrote this, so some of your edits may no longer fit. Open it to check.
      </span>
    ) : row.status === 'error' ? (
      <span className="text-red-400">Couldn&apos;t load this page. Open it to check.</span>
    ) : (
      <>
        {row.sections} section{row.sections === 1 ? '' : 's'} ·{' '}
        <span className="text-add">+{row.added}</span>{' '}
        <span className="text-del">−{row.removed}</span>
      </>
    )
  return (
    <li className="flex items-center gap-3 bg-fw-surface-2/40 px-3 py-2.5">
      <input
        type="checkbox"
        checked={on}
        disabled={!ready}
        onChange={(e) => onTick(e.target.checked)}
        aria-label={`Include ${label}`}
        className="h-4 w-4 shrink-0 accent-brand disabled:opacity-40"
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[0.8125rem] text-fw-text">
          {label}
          {open && <span className="ml-1.5 text-[0.6875rem] text-fw-faint">· open</span>}
        </p>
        <p className="text-xs text-fw-faint">{sub}</p>
      </div>
      <button
        type="button"
        onClick={onCheck}
        className="shrink-0 text-xs font-medium text-brand-hover underline"
      >
        {ready ? 'Check' : 'Open'}
      </button>
    </li>
  )
}

// What goes out, folded. Closed, it still says the essentials, so nobody has
// to open it to know what pressing Send does: the title, how much changed,
// where it goes and under whose name. Open, it's the pull request in full.
function PreviewFold({
  title,
  files,
  added,
  removed,
  login,
  children,
}: {
  title: string
  files: number
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
          <span className="block text-[0.8125rem] font-medium text-fw-text">
            What the maintainers will see
          </span>
          <span className="mt-0.5 block text-xs leading-relaxed break-words text-fw-faint">
            <span className="font-mono text-fw-muted">{title}</span> · {files} file
            {files === 1 ? '' : 's'}, <span className="text-add">+{added}</span>{' '}
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

// A statement, not a question: who will be asked to review, by name and face,
// so "we'll tell them" is checkable rather than merely claimed.
function People({ groups }: { groups: StewardGroup[] }) {
  const rows = groups.flatMap((g) => g.people.map((person) => ({ person, framework: g.framework })))
  return (
    <ul className="mt-3 divide-y divide-fw-border-soft overflow-hidden rounded-lg border border-fw-border-soft">
      {rows.map(({ person, framework }) => (
        <li key={`${framework}:${person.slug}`} className="flex items-center gap-3 bg-fw-surface-2/40 px-3 py-2.5">
          <img
            src={person.avatar}
            alt=""
            className="h-7 w-7 shrink-0 rounded-full border border-fw-border object-cover"
            onError={(e) => {
              e.currentTarget.style.visibility = 'hidden'
            }}
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[0.8125rem] text-fw-text">
              {person.name} <span className="text-fw-faint">@{person.slug}</span>
            </p>
            <p className="text-xs text-fw-faint">The {framework} steward</p>
          </div>
          <span className="shrink-0 rounded-full bg-brand-soft px-2 py-0.5 text-[0.6875rem] font-medium text-brand-hover">
            Asked to review
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
        <span className="block text-[0.8125rem] font-medium text-fw-text">{title}</span>
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
