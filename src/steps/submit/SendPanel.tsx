import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Button, CheckIcon, ExternalIcon } from '../../components/ui.js'
import { checkFork, signInAndComeBack, submit } from '../../lib/send.js'
import { rememberReturn } from '../../lib/useWizardRoute.js'
import type { ForkCheck, SendProblem, Sent, SubmitInput } from '../../lib/send.js'
import type { AuthState } from '../../lib/types.js'

// The foot of the Send step: what will go out, anything still standing between
// the contributor and sending it, and the button.
//
// Most sends go straight through. A new contributor first has a one-time
// setup, because suggestions are sent from their own copy of the docs (a fork)
// and the wizard can only write to it once they've said so on GitHub. Both
// steps happen on GitHub's own pages, so what they agree to is shown by GitHub,
// not described by us.
//
// The setup is here rather than straight after signing in on purpose: by now
// they've written something worth sending, so two clicks on GitHub are a small
// price for it instead of a toll at the door. And it's on the page from the
// start, in the order things happen, above a Send that waits for it: a first
// press that turned out not to send anything would read as a failure.

type Phase =
  /** `setUp` is their copy, when the setup has just been finished. */
  | { kind: 'idle'; setUp?: string }
  | { kind: 'checking' }
  | { kind: 'setup'; fork: ForkCheck; checking?: boolean }
  | { kind: 'sending' }
  | { kind: 'problem'; problem: Exclude<SendProblem, { kind: 'needs-setup' }> }

export default function SendPanel({
  auth,
  justInstalled,
  noteMissing,
  request,
  page,
  preview,
  onSent,
}: {
  auth: AuthState
  /** Back from installing the app on their copy: say so once it checks out. */
  justInstalled: boolean
  /** Sending needs a note: "what and why" is the first thing a maintainer
   *  asks, and one sentence is a small ask from someone who just wrote a page. */
  noteMissing: boolean
  /** Builds what gets sent, at the moment it's sent. */
  request: () => SubmitInput
  /** The page's name, for the Done step. */
  page: string
  /** The pull request as it will go out. */
  preview: ReactNode
  onSent: (sent: Sent) => void
}) {
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' })

  const fail = (problem: SendProblem) =>
    problem.kind === 'needs-setup' ? recheck() : setPhase({ kind: 'problem', problem })

  // Where the setup stands. A copy that turns out ready goes back to the
  // button rather than sending by itself: they press Send, not the wizard.
  // `announce` says "You're set up" when it does: after a trip to GitHub, not
  // on an ordinary visit.
  //
  // Coming back to the tab fires both `focus` and `visibilitychange`, so a
  // check already under way is left to answer for both.
  const inFlight = useRef(false)
  const recheck = useCallback(
    async (hint?: Extract<Phase, { kind: 'setup' }>, announce = true) => {
      if (inFlight.current) return
      inFlight.current = true
      setPhase(hint ? { ...hint, checking: true } : { kind: 'checking' })
      const check = await checkFork()
      inFlight.current = false
      if (!check.ok) {
        const p = check.problem
        return setPhase(p.kind === 'needs-setup' ? { kind: 'idle' } : { kind: 'problem', problem: p })
      }
      if (check.value.status === 'ready') {
        return setPhase({ kind: 'idle', setUp: announce ? check.value.repo : undefined })
      }
      setPhase({ kind: 'setup', fork: check.value })
    },
    [],
  )

  async function send() {
    setPhase({ kind: 'checking' })
    const check = await checkFork()
    if (!check.ok) return fail(check.problem)
    if (check.value.status !== 'ready') return setPhase({ kind: 'setup', fork: check.value })

    setPhase({ kind: 'sending' })
    const res = await submit(request())
    if (!res.ok) return fail(res.problem)
    onSent({ ...res.value, page })
  }

  // Look at their copy as soon as there's someone signed in to look for, so a
  // first-timer sees the setup before reaching for the button.
  useEffect(() => {
    if (auth.status === 'in') recheck(undefined, justInstalled)
  }, [auth.status, justInstalled, recheck])

  // GitHub's Fork page opens in a new tab, since nothing sends anyone back from
  // it. Coming back to this one is the moment to look again, so the step ticks
  // itself off without a button to find.
  const inSetup = phase.kind === 'setup' ? phase : null
  useEffect(() => {
    if (!inSetup) return
    const onReturn = () => {
      if (document.visibilityState === 'visible') recheck(inSetup)
    }
    window.addEventListener('focus', onReturn)
    document.addEventListener('visibilitychange', onReturn)
    return () => {
      window.removeEventListener('focus', onReturn)
      document.removeEventListener('visibilitychange', onReturn)
    }
  }, [inSetup, recheck])

  const sending = phase.kind === 'sending'
  const busy = phase.kind === 'checking' || sending

  let button: ReactNode
  let line: ReactNode
  if (auth.status === 'unavailable') {
    button = <Button disabled>Send for review</Button>
    line = 'Sending needs the deployed wizard. This local preview can’t sign in.'
  } else if (auth.status === 'loading') {
    button = <Button disabled>Send for review</Button>
    line = 'One moment…'
  } else if (auth.status === 'out') {
    button = <Button onClick={signInAndComeBack}>Sign in to send</Button>
    line = 'Your draft stays in this browser while you do.'
  } else if (phase.kind === 'problem' && phase.problem.kind === 'expired') {
    button = <Button onClick={signInAndComeBack}>Sign in again</Button>
    line = 'Your draft stays in this browser while you do.'
  } else {
    button = (
      <Button onClick={send} disabled={busy || phase.kind === 'setup' || noteMissing}>
        {sending
          ? 'Sending…'
          : phase.kind === 'checking'
            ? 'Checking…'
            : phase.kind === 'problem'
              ? 'Send again'
              : 'Send for review'}
      </Button>
    )
    // What pressing it does, said next to it, so sending isn't a leap of
    // faith: who it's from, where it goes, and that nothing is published yet.
    line = sending
      ? 'Saving your change to your copy and opening your suggestion. This takes a few seconds.'
      : phase.kind === 'checking'
        ? 'Making sure your copy of the docs is ready.'
        : phase.kind === 'setup'
          ? 'Finish the one-time setup above first.'
          : noteMissing
            ? 'Write a note above first. It’s the first thing the maintainers read.'
            : `Opens a pull request on GitHub${auth.user?.login ? ` as @${auth.user.login}` : ''}. Nothing changes on the site until a maintainer accepts it.`
  }

  return (
    <>
      <div className="space-y-5 px-6 pb-6">
        {preview}
        {phase.kind === 'setup' && (
          <SetupPanel
            fork={phase.fork}
            checking={!!phase.checking}
            onRecheck={() => recheck(phase)}
          />
        )}
        {phase.kind === 'idle' && phase.setUp && <SetUpPanel repo={phase.setUp} />}
        {phase.kind === 'problem' && <ProblemPanel problem={phase.problem} />}
      </div>

      <div className="flex flex-col-reverse items-center gap-3 border-t border-fw-border px-6 py-4 sm:flex-row sm:justify-between">
        <p aria-live="polite" className="max-w-md text-center text-xs leading-relaxed text-fw-faint sm:text-left">
          {line}
        </p>
        <div className="shrink-0">{button}</div>
      </div>
    </>
  )
}

function SetupPanel({
  fork,
  checking,
  onRecheck,
}: {
  fork: ForkCheck
  checking: boolean
  onRecheck: () => void
}) {
  // Past step one as soon as the copy exists, whether or not it's ours to
  // write to yet.
  const forked = fork.status === 'needs-install' && !!fork.repo
  const name = fork.repo?.split('/')[1] ?? 'your copy'

  return (
    <section aria-labelledby="cw-setup">
      <h3 id="cw-setup" className="text-sm font-semibold text-fw-strong">
        One-time setup: your own copy of the docs
      </h3>
      <p className="mt-1 text-[13px] leading-relaxed text-fw-muted">
        Suggestions are sent from your own copy of the docs on GitHub, called a
        fork. You set it up once, and every suggestion after this one goes
        straight through.
      </p>

      <ol className="mt-4 space-y-3">
        <SetupItem n={1} done={forked} title="Make your copy">
          {forked ? (
            <>
              Your copy:{' '}
              <a
                href={`https://github.com/${fork.repo}`}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono text-brand-hover underline"
              >
                {fork.repo}
              </a>
            </>
          ) : (
            <>
              <p>
                GitHub&apos;s Fork page opens in a new tab. Click{' '}
                <b className="text-fw-text">Create fork</b>, then come back to
                this tab.
              </p>
              <a
                href={fork.forkUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2.5 inline-block"
              >
                <Button variant="outline">
                  Open the Fork page <ExternalIcon width={14} height={14} />
                </Button>
              </a>
            </>
          )}
        </SetupItem>

        {/* In this tab, unlike the Fork page: GitHub sends people back from
            the install to the app's Setup URL, and `rememberReturn` makes
            that land on this step again, with the draft. */}
        <SetupItem n={2} done={false} title="Let the wizard save to your copy" dim={!forked}>
          <p>
            On GitHub, choose{' '}
            <b className="text-fw-text">Only select repositories</b>, pick{' '}
            <b className="text-fw-text">{name}</b>, then{' '}
            <b className="text-fw-text">Install</b>. GitHub brings you back here.
          </p>
          <p className="mt-1">
            The wizard can then write to that copy and nothing else on your
            account.
          </p>
          <Button
            className="mt-2.5"
            disabled={!forked}
            onClick={() => {
              rememberReturn()
              window.location.href = fork.installUrl
            }}
          >
            Give access to your copy
          </Button>
        </SetupItem>
      </ol>

      <button
        type="button"
        onClick={onRecheck}
        disabled={checking}
        className="mt-4 text-xs font-medium text-brand-hover underline disabled:opacity-50"
      >
        {checking ? 'Checking…' : 'I’ve done this. Check again'}
      </button>
    </section>
  )
}

// Where the setup panel was, once it's done: the setup ends on a clear
// "that worked" instead of a panel that silently vanishes.
function SetUpPanel({ repo }: { repo: string }) {
  return (
    <section
      aria-live="polite"
      className="flex gap-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3"
    >
      <span
        aria-hidden
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-500"
      >
        <CheckIcon width={13} height={13} />
      </span>
      <div className="min-w-0 text-[13px] leading-relaxed text-fw-muted">
        <p className="font-semibold text-fw-text">You&apos;re good to go</p>
        <p className="mt-0.5">
          Your copy of the docs is ready at{' '}
          <a
            href={`https://github.com/${repo}`}
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono text-brand-hover underline"
          >
            {repo}
          </a>
          . You won&apos;t need to do this again. Press{' '}
          <b className="text-fw-text">Send for review</b> when you&apos;re ready.
        </p>
      </div>
    </section>
  )
}

function SetupItem({
  n,
  done,
  title,
  dim,
  children,
}: {
  n: number
  done: boolean
  title: string
  /** Not reachable yet: the step before it comes first. */
  dim?: boolean
  children: ReactNode
}) {
  return (
    <li
      className={`flex gap-3 rounded-lg border border-fw-border-soft bg-fw-surface-2/40 p-3 ${
        dim ? 'opacity-60' : ''
      }`}
    >
      <span
        aria-hidden
        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
          done ? 'bg-emerald-500/15 text-emerald-500' : 'bg-brand-soft text-brand-hover'
        }`}
      >
        {done ? <CheckIcon width={13} height={13} /> : n}
      </span>
      <div className="min-w-0 flex-1 text-[13px] leading-relaxed text-fw-muted">
        <p className="font-medium text-fw-text">
          {title}
          {done && <span className="sr-only"> (done)</span>}
        </p>
        <div className="mt-0.5">{children}</div>
      </div>
    </li>
  )
}

function ProblemPanel({
  problem,
}: {
  problem: Exclude<SendProblem, { kind: 'needs-setup' }>
}) {
  if (problem.kind === 'expired') {
    return (
      <p className="text-[13px] leading-relaxed text-fw-muted">
        <span className="font-semibold text-fw-text">You need to sign in again.</span>{' '}
        Sign-ins last 8 hours, and end early if the wizard&apos;s access was
        removed on GitHub. Sign in again and you&apos;ll come straight back
        here, with everything you wrote still in place.
      </p>
    )
  }
  // The one problem the contributor has to act on, so it looks like a warning
  // rather than a note, and spells out every click: the people who meet it
  // have never seen GitHub's "Sync fork" button.
  if (problem.kind === 'needs-sync') {
    return (
      <div
        role="alert"
        className="flex gap-2.5 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-[13px] leading-relaxed text-fw-muted"
      >
        <span aria-hidden className="mt-0.5 shrink-0 text-amber-500">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M12 9v4M12 17h.01" />
            <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
          </svg>
        </span>
        <div className="min-w-0">
          <p className="font-semibold text-amber-500">
            Your copy of Frameworks needs updating first
          </p>
          <p className="mt-0.5">
            This page has changed since you made your copy, in the same place
            you edited, so the wizard can&apos;t combine the two by itself.
          </p>
          <ol className="mt-2 list-decimal space-y-0.5 pl-5">
            <li>Use the button below to go to your copy of Frameworks on GitHub.</li>
            <li>
              Click <b className="text-fw-text">Sync fork</b>, then{' '}
              <b className="text-fw-text">Update branch</b>.
            </li>
            <li>
              Come back here and press <b className="text-fw-text">Send again</b>.
            </li>
          </ol>
          <a
            href={`https://github.com/${problem.repo}`}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-block"
          >
            <Button variant="outline">
              Open your copy of Frameworks <ExternalIcon width={14} height={14} />
            </Button>
          </a>
        </div>
      </div>
    )
  }
  return (
    <p
      role="alert"
      className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-[13px] leading-relaxed text-red-400"
    >
      That didn&apos;t go through. {problem.message} Nothing was sent, and your
      draft is still here.
    </p>
  )
}
