import { Card, Button, CheckIcon, ExternalIcon, PencilIcon } from '../components/ui.js'
import { DISCORD_URL } from '../lib/prTemplate.js'
import type { Sent } from '../lib/send.js'
import type { StepId } from '../wizard/steps.js'

// Step: it's sent.
//
// The one thing to hand over is the link. From here the conversation about the
// suggestion happens on GitHub, and GitHub, not the wizard, is where the
// contributor hears about it. The rest is what to expect next, said once, so
// nobody takes a quiet week for a rejection.
export default function DoneStep({
  sent,
  onGoTo,
}: {
  sent: Sent | null
  onGoTo: (step: StepId) => void
}) {
  if (!sent) {
    return (
      <Card className="mx-auto max-w-xl px-8 py-10 text-center">
        <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-full bg-fw-surface-2 text-fw-faint">
          <PencilIcon />
        </div>
        <h2 className="text-lg font-semibold text-fw-strong">Nothing sent yet</h2>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-fw-muted">
          Once you send a suggestion, this is where you&apos;ll find the link
          to it.
        </p>
        <Button className="mt-6" onClick={() => onGoTo('submit')}>
          Back to Send
        </Button>
      </Card>
    )
  }

  return (
    <Card className="mx-auto max-w-xl px-8 py-10">
      <div className="text-center">
        <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-500">
          <CheckIcon width={22} height={22} />
        </div>
        <h2 className="text-xl font-semibold text-fw-strong">Sent. Thank you!</h2>
        <p className="mt-2 text-sm leading-relaxed text-fw-muted">
          Your suggestion for {sent.page} is on GitHub as #{sent.number}, waiting
          for review.
        </p>
        <a href={sent.url} target="_blank" rel="noopener noreferrer" className="mt-6 inline-block">
          <Button>
            See it on GitHub <ExternalIcon width={15} height={15} />
          </Button>
        </a>
      </div>

      {/* Only when it happened, and only when it matters: a change elsewhere
          in the page is GitHub's to combine and not worth a word. The
          maintainers get the same news, in the pull request itself. */}
      {sent.overlap && (
        <p className="mt-6 rounded-lg border border-fw-border-soft bg-fw-surface-2/40 p-3 text-[13px] leading-relaxed text-fw-muted">
          Someone else changed the same lines of this page while you were
          writing. The maintainers will reconcile the two, so there&apos;s
          nothing you need to do.
        </p>
      )}

      <section className="mt-8">
        <h3 className="text-sm font-semibold text-fw-strong">What happens next</h3>
        <ul className="mt-2 list-disc space-y-1.5 pl-5 text-[13px] leading-relaxed text-fw-muted">
          <li>
            The maintainers read it. We&apos;ve mentioned anyone credited on the
            page, and the framework&apos;s steward if it has one, so they hear
            about it too.
          </li>
          <li>
            If someone has a question or suggests a change, GitHub lets you know.
            You reply on the page linked above.
          </li>
          <li>
            Small fixes, like a typo, the maintainers can make themselves, without
            sending it back to you.
          </li>
          <li>Once it&apos;s accepted, your change appears on the site.</li>
        </ul>
      </section>

      {/* Asked here rather than before sending: now there's a link to share. */}
      <p className="mt-6 rounded-lg border border-fw-border-soft bg-fw-surface-2/40 p-3 text-[13px] leading-relaxed text-fw-muted">
        Want the community&apos;s take too? Share the link in{' '}
        <a
          href={DISCORD_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-brand-hover underline"
        >
          our Discord
        </a>
        . Worth it for judgement calls, or anything you&apos;re not sure about.
      </p>

      <div className="mt-8 text-center">
        <Button variant="outline" onClick={() => onGoTo('choose')}>
          Suggest another change
        </Button>
      </div>
    </Card>
  )
}
