import { useState } from 'react'
import { REPO, BRANCH } from '../../lib/github.js'
import { titleize } from '../../lib/format.js'
import { buildPrBody, buildPrTitle, TEMPLATE_LINES } from '../../lib/prTemplate.js'
import type { PrAnswers } from '../../lib/prTemplate.js'
import type { AuthUser, PageEntry, Person } from '../../lib/types.js'

// The pull request, before it exists.
//
// The welcome page's PrPreviewCard shows a stranger what a pull request *is*,
// with a hardcoded sample, because at that point there's nothing of theirs to
// show. This is its opposite number at the other end of the wizard: the same
// object, drawn from what they actually wrote, one screen before it is sent.
//
// It's here so the Send step never asks people to hand work to strangers
// without showing them the thing being handed over. Every promise the step
// makes is checkable here: the note appears where it will appear, the mentions
// are visible as mentions, and the ticks are the ticks a maintainer will read.
//
// It renders the body rather than printing the markdown, because rendered
// markdown is what GitHub shows too — the raw source is a click away for anyone
// who wants to see the literal bytes, and comes from `buildPrBody` itself so
// the two can't disagree.
export default function PrPreview({
  current,
  user,
  note,
  answers,
  contributors,
  stewards,
  added,
  removed,
}: {
  current?: PageEntry
  user?: AuthUser
  note: string
  answers: PrAnswers
  contributors: Person[]
  stewards: Person[]
  added: number
  removed: number
}) {
  const [raw, setRaw] = useState(false)

  const title = buildPrTitle(current)
  const trimmed = note.trim()
  const who = user?.name || user?.login
  // Same condition `buildPrBody` uses for its stewardship callout.
  const volunteering = !!answers.stewardInterest && stewards.length === 0

  return (
    <div className="overflow-hidden rounded-xl border border-fw-border bg-fw-surface-2/40">
      {/* Repo bar. The pill says what this is, because everything below it is
          drawn to look like the real thing and the one thing it must never do
          is let someone believe they've already sent it. */}
      <div className="flex items-center gap-2 border-b border-fw-border px-4 py-2.5">
        <GithubMark />
        <span className="min-w-0 truncate font-mono text-[11px] text-fw-muted">
          {REPO}
        </span>
        <span className="ml-auto shrink-0 rounded-full border border-fw-border bg-fw-surface px-2 py-0.5 text-[11px] font-medium text-fw-faint">
          Not sent yet
        </span>
      </div>

      <div className="px-4 py-3.5">
        <h4 className="text-[15px] font-semibold text-fw-strong">{title}</h4>

        <div className="mt-2 flex flex-wrap items-center gap-2 text-[12px] text-fw-muted">
          {user?.avatar ? (
            <img
              src={user.avatar}
              alt=""
              className="h-5 w-5 shrink-0 rounded-full border border-fw-border object-cover"
            />
          ) : (
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand text-[10px] font-bold text-white">
              {(who ?? 'Y').charAt(0).toUpperCase()}
            </span>
          )}
          <span>
            <span className="font-medium text-fw-text">{who ?? 'you'}</span> wants
            to merge 1 commit into{' '}
            <span className="rounded bg-fw-surface-2 px-1 py-0.5 font-mono text-[11px] text-fw-text">
              {BRANCH}
            </span>
          </span>
        </div>

        {/* The file, and how much of it moved. */}
        {current && (
          <div className="mt-3.5 flex items-center gap-2 rounded-lg border border-fw-border bg-fw-surface-2/60 px-3 py-1.5">
            <span className="truncate font-mono text-[11px] text-fw-muted">
              {current.rel}
            </span>
            <span className="ml-auto shrink-0 font-mono text-[11px]">
              <span className="text-add">+{added}</span>{' '}
              <span className="text-del">−{removed}</span>
            </span>
          </div>
        )}

        {raw ? (
          <pre className="mt-3.5 max-h-80 overflow-auto rounded-lg border border-fw-border bg-fw-surface p-3 font-mono text-[11.5px] leading-relaxed whitespace-pre-wrap text-fw-muted">
            {buildPrBody({ note, answers, current, contributors, stewards })}
          </pre>
        ) : (
          <div className="mt-3.5 rounded-lg border border-fw-border bg-fw-surface p-3.5">
            <p className="text-[12px] font-semibold text-fw-strong">
              Frameworks PR Checklist
            </p>

            {/* The note, where it lands. An empty one is shown as the PR would
                show it — a maintainer opening this would find that sentence and
                nothing else, which is a more useful thing to know now than
                after it's sent. */}
            <div className="mt-2.5 border-l-2 border-fw-border pl-3">
              {trimmed ? (
                <p className="text-[13px] leading-relaxed whitespace-pre-wrap text-fw-text">
                  {trimmed}
                </p>
              ) : (
                <p className="text-[13px] text-fw-faint italic">
                  No note given.
                </p>
              )}
            </div>

            <ul className="mt-3 space-y-1.5">
              <Tick on>{TEMPLATE_LINES.describe}</Tick>
              <Tick on={contributors.length > 0}>{TEMPLATE_LINES.contributors}</Tick>
              {stewards.length > 0 ? (
                <Tick on>{TEMPLATE_LINES.steward}</Tick>
              ) : (
                <Tick on={!!answers.stewardInterest}>
                  {TEMPLATE_LINES.stewardInterest}
                </Tick>
              )}
              <Tick on={!!answers.discord}>{TEMPLATE_LINES.discord}</Tick>
              <Tick on={!!answers.typos}>{TEMPLATE_LINES.typos}</Tick>
            </ul>

            {(contributors.length > 0 || stewards.length > 0 || volunteering) && (
              <div className="mt-3 space-y-1 border-t border-fw-border pt-3 text-[12px] text-fw-muted">
                {contributors.length > 0 && (
                  <p>
                    Credited on this page: <Handles people={contributors} />
                  </p>
                )}
                {stewards.length > 0 && (
                  <p>
                    Review requested from the framework steward:{' '}
                    <Handles people={stewards} />
                  </p>
                )}
                {volunteering && current && (
                  <p>
                    <span className="font-semibold text-fw-text">
                      {titleize(current.framework)} has no steward.
                    </span>{' '}
                    The contributor has expressed interest in taking it on.
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        <button
          type="button"
          onClick={() => setRaw((r) => !r)}
          className="mt-2.5 text-[11px] font-medium text-fw-faint underline transition-colors hover:text-fw-text"
        >
          {raw ? 'Back to the readable version' : 'Show the text we actually send'}
        </button>
      </div>
    </div>
  )
}

function Tick({ on, children }: { on?: boolean; children: string }) {
  return (
    <li className="flex gap-2 text-[12px] leading-relaxed">
      <span
        aria-hidden
        className={`mt-px flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[3px] border text-[9px] font-bold ${
          on
            ? 'border-brand bg-brand text-white'
            : 'border-fw-border bg-fw-surface-2 text-transparent'
        }`}
      >
        ✓
      </span>
      {/* An unticked box is something not done, which is not the same as
          something withdrawn. Striking it through would say the second. */}
      <span className={on ? 'text-fw-muted' : 'text-fw-faint'}>{children}</span>
      <span className="sr-only">{on ? '(ticked)' : '(not ticked)'}</span>
    </li>
  )
}

// `@handle @handle` — as the mention will actually read once GitHub has it.
const Handles = ({ people }: { people: Person[] }) => (
  <>
    {people.map((p, i) => (
      <span key={p.slug}>
        {i > 0 && ' '}
        <span className="font-medium text-brand-hover">@{p.slug}</span>
      </span>
    ))}
  </>
)

// Mirrors the mark on the welcome page's PrPreviewCard. Kept local to each card
// rather than shared, so neither can be restyled by a change aimed at the other.
const GithubMark = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" className="shrink-0 text-fw-faint">
    <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
  </svg>
)
