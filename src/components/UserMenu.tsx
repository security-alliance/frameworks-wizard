import { useEffect, useId, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { ChevronDown, SignOutIcon, ExternalIcon, ShieldIcon } from './ui.js'
import { REVOKE_URL } from '../lib/github.js'
import { listPrs, signInAndComeBack } from '../lib/send.js'
import type { OpenPr } from '../lib/send.js'
import { DraftList, relativeTime } from './DraftsMenu.js'
import type { DraftSummary } from '../lib/drafts.js'
import type { AuthUser } from '../lib/types.js'

// Signed-in identity in the header, present on every step once signed in, so
// the contributor can always see who the change will be credited to. Also
// where their work is: what they sent that is still open, and the drafts they
// haven't sent.
//
// A disclosure, not an ARIA menu: it mixes links and buttons, and has no
// arrow-key handling. Esc and a click outside close it.
export default function UserMenu({
  user,
  onSignOut,
  drafts,
  currentPath,
  pageLabel,
  onOpenDraft,
  onDiscardDraft,
  discarded,
  onUndoDiscard,
}: {
  user: AuthUser
  onSignOut: () => void
  drafts: DraftSummary[]
  currentPath: string
  pageLabel: (path: string) => string
  onOpenDraft: (path: string) => void
  onDiscardDraft: (path: string) => void
  discarded: DraftSummary[]
  onUndoDiscard: (path: string) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const panelId = useId()

  // Asked for each time the panel opens, so a suggestion just sent is there.
  const [prs, setPrs] = useState<
    | { state: 'loading' }
    | { state: 'ok'; prs: OpenPr[]; total: number; all: string }
    | { state: 'expired' }
    | { state: 'error' }
  >({ state: 'loading' })
  useEffect(() => {
    if (!open) return
    let live = true
    listPrs().then((r) => {
      if (!live) return
      if (r.ok) setPrs({ state: 'ok', ...r.value })
      else setPrs({ state: r.problem.kind === 'expired' ? 'expired' : 'error' })
    })
    return () => {
      live = false
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      setOpen(false)
      trigger.current?.focus()
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const name = user.name || user.login
  const showDrafts = drafts.length > 0 || discarded.length > 0

  return (
    <div ref={ref} className="relative">
      <button
        ref={trigger}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={panelId}
        aria-label="Your account and suggestions"
        className="flex items-center gap-1.5 rounded-full border border-fw-border bg-fw-surface-2/60 py-1 pl-1 pr-2 transition-colors hover:border-brand/60"
      >
        <Avatar user={user} className="h-7 w-7" />
        <ChevronDown className={`text-fw-faint transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div
          id={panelId}
          className="fw-card-shadow absolute right-0 z-50 mt-2 w-96 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-fw-border bg-fw-surface"
        >
          <a
            href={`https://github.com/${user.login}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 border-b border-fw-border px-4 py-3 hover:bg-fw-surface-2"
          >
            <Avatar user={user} className="h-10 w-10" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold text-fw-strong">{name}</div>
              <div className="text-xs text-fw-faint">
                @{user.login}, gets the credit for your suggestions
              </div>
            </div>
            <ExternalIcon width="16" height="16" className="shrink-0 text-fw-faint" />
          </a>

          <Section title="Sent for review" busy={prs.state === 'loading'}>
            {prs.state === 'loading' ? (
              <>
                <SkeletonRow />
                <SkeletonRow />
              </>
            ) : prs.state === 'expired' ? (
              <Quiet>
                <button onClick={signInAndComeBack} className="font-medium text-brand-hover underline">
                  Sign in again
                </button>{' '}
                to see them.
              </Quiet>
            ) : prs.state === 'error' ? (
              <Quiet>Couldn&apos;t load them right now.</Quiet>
            ) : prs.prs.length === 0 ? (
              <Quiet>Nothing open. Suggestions you send appear here.</Quiet>
            ) : (
              <>
                <ul className="max-h-64 overflow-y-auto">
                  {sortPrs(prs.prs).map((pr) => (
                    <li key={pr.number}>
                      <PrRow pr={pr} />
                    </li>
                  ))}
                </ul>
                {prs.total > prs.prs.length && (
                  <a
                    href={prs.all}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block px-4 py-2 text-xs font-medium text-brand-hover underline"
                  >
                    See all {prs.total} on GitHub
                  </a>
                )}
              </>
            )}
          </Section>

          {showDrafts && (
            <Section title="Drafts, not sent">
              <DraftList
                drafts={drafts}
                currentPath={currentPath}
                pageLabel={pageLabel}
                onOpen={(p) => {
                  setOpen(false)
                  onOpenDraft(p)
                }}
                onDiscard={onDiscardDraft}
                discarded={discarded}
                onUndo={onUndoDiscard}
              />
            </Section>
          )}

          <div className="py-1">
            <button
              onClick={() => {
                setOpen(false)
                onSignOut()
              }}
              className="flex w-full items-center gap-2.5 px-4 py-2 text-left text-sm text-fw-muted hover:bg-fw-surface-2 hover:text-fw-text"
            >
              <SignOutIcon width="16" height="16" /> Sign out
            </button>
            {/* Signing out ends the session; this is what removes the app's
                access to the account, and only GitHub can do it. */}
            <a
              href={REVOKE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2.5 px-4 py-2 text-[0.7813rem] text-fw-muted hover:bg-fw-surface-2 hover:text-fw-text"
            >
              <ShieldIcon width="16" height="16" className="shrink-0" />
              <span className="flex-1">Remove this app&apos;s access on GitHub</span>
              <ExternalIcon width="14" height="14" className="shrink-0 text-fw-faint" />
            </a>
          </div>
        </div>
      )}
    </div>
  )
}

function Section({ title, busy, children }: { title: string; busy?: boolean; children: ReactNode }) {
  return (
    <section aria-busy={busy || undefined} className="border-b border-fw-border pb-1">
      <h3 className="px-4 pt-3 pb-1 text-[0.7813rem] font-semibold text-fw-muted">{title}</h3>
      {children}
    </section>
  )
}

const Quiet = ({ children }: { children: ReactNode }) => (
  <p className="px-4 pb-2.5 text-xs leading-relaxed text-fw-faint">{children}</p>
)

// The same height as a real row, so the panel doesn't jump when the list arrives.
const SkeletonRow = () => (
  <div aria-hidden className="px-4 py-2">
    <div className="h-4 w-3/4 rounded bg-fw-surface-2" />
    <div className="mt-1.5 h-3 w-1/3 rounded bg-fw-surface-2" />
  </div>
)

// The ones needing the contributor first, then the most recently active.
function sortPrs(prs: OpenPr[]): OpenPr[] {
  const urgent = (p: OpenPr) => (p.reviewDecision === 'CHANGES_REQUESTED' ? 0 : 1)
  return [...prs].sort((a, b) => urgent(a) - urgent(b) || Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
}

function PrRow({ pr }: { pr: OpenPr }) {
  const m = /^docs\([^)]+\):/.exec(pr.title)
  const chip =
    pr.reviewDecision === 'CHANGES_REQUESTED'
      ? { text: 'Changes requested', cls: 'bg-warn-soft text-warn' }
      : pr.reviewDecision === 'APPROVED'
        ? { text: 'Approved', cls: 'bg-add-soft text-add' }
        : pr.isDraft
          ? { text: 'Draft', cls: 'bg-fw-surface-2 text-fw-muted' }
          : null
  return (
    <a
      href={pr.url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-start gap-2 px-4 py-2 hover:bg-fw-surface-2"
    >
      <span className="min-w-0 flex-1">
        <span className="line-clamp-2 text-sm text-fw-text">
          {m && <span className="text-fw-faint">{m[0]}</span>}
          {m ? pr.title.slice(m[0].length) : pr.title}
        </span>
        <span className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-fw-faint">
          {chip && (
            <span className={`rounded-full px-2 py-0.5 text-[0.6875rem] font-medium ${chip.cls}`}>
              {chip.text}
            </span>
          )}
          #{pr.number}, updated {relativeTime(Date.parse(pr.updatedAt))}
        </span>
      </span>
      <ExternalIcon width="14" height="14" className="mt-1 shrink-0 text-fw-faint" />
    </a>
  )
}

function Avatar({ user, className = '' }: { user: AuthUser; className?: string }) {
  const initial = (user.name || user.login || '?').charAt(0).toUpperCase()
  return user.avatar ? (
    <img
      src={user.avatar}
      alt=""
      className={`shrink-0 rounded-full border border-fw-border object-cover ${className}`}
    />
  ) : (
    <span
      className={`flex shrink-0 items-center justify-center rounded-full bg-brand-soft text-sm font-semibold text-brand-hover ${className}`}
    >
      {initial}
    </span>
  )
}
