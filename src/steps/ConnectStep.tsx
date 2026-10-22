import { Card, Button, ShieldIcon, CheckIcon } from '../components/ui.js'
import { REVOKE_URL } from '../lib/github.js'
import { AUTH_API } from '../lib/useAuth.js'
import type { AuthState } from '../lib/types.js'

// Sign-in. Auth state lives in `useAuth` at the app level so this step and the
// header avatar always agree.
//
// Security posture the UI relies on: the browser NEVER receives a GitHub token.
// It only asks our backend who is signed in and starts the flow by navigating to
// GET /wizard/api/auth/login. All token handling is server-side.
//
// `authError` arrives as a prop rather than being read from the address here:
// the OAuth params are stripped from the URL as soon as the router has acted on
// them, so by the time this renders they are already gone.
export function ConnectStep({
  auth,
  authError,
}: {
  auth: AuthState
  authError: string | null
}) {
  return (
    <Card className="mx-auto max-w-xl px-8 py-10 text-center">
      <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-full bg-brand-soft text-brand-hover">
        <ShieldIcon />
      </div>
      <h2 className="text-xl font-semibold text-fw-strong">
        Sign in so your work is credited
      </h2>

      {auth.status === 'loading' && (
        <p className="mt-4 text-sm text-fw-muted">One moment…</p>
      )}

      {auth.status === 'out' && (
        <>
          <p className="mt-3 text-sm leading-relaxed text-fw-muted">
            We use GitHub accounts to credit contributors. Signing in takes a few
            seconds and doesn&apos;t require you to know anything about GitHub.
            We never see your password, and we only ask for permission to submit
            your suggestion for you.
          </p>
          {authError && (
            <p className="mt-4 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-400">
              That didn&apos;t work ({authError}). Please try again.
            </p>
          )}
          {/* Real navigation (not fetch): the backend 302-redirects to GitHub. */}
          <a href={`${AUTH_API}/login`} className="mt-6 inline-block">
            <Button>Continue with GitHub</Button>
          </a>
          <p className="mt-3 text-xs text-fw-faint">
            Don&apos;t have an account?{' '}
            <a
              href="https://github.com/signup"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-brand-hover underline"
            >
              Create one
            </a>
            . It&apos;s free. Then come back and sign in.
          </p>
        </>
      )}

      {auth.status === 'in' && auth.user && (
        <>
          <p className="mt-4 inline-flex items-center gap-1.5 text-sm text-emerald-500">
            <CheckIcon /> Signed in as {auth.user.name || auth.user.login}
          </p>
          <p className="mt-3 text-sm leading-relaxed text-fw-muted">
            You&apos;re all set. Your account is shown at the top of the page,
            where you can sign out at any time.
          </p>
          {/* Signing out and revoking are different things, and only one of them
              is under our control. Saying so here — at the moment access is
              granted — is the honest place for it. */}
          <div className="mt-5 rounded-xl border border-fw-border bg-fw-surface-2/50 px-4 py-3 text-left">
            <h3 className="text-xs font-semibold text-fw-strong">
              Taking this access away again
            </h3>
            <p className="mt-1.5 text-[13px] leading-relaxed text-fw-muted">
              Signing out ends your session here. To withdraw the app&apos;s
              access to your GitHub account entirely, revoke it on GitHub:{' '}
              <span className="text-fw-text">
                Settings → Applications → Authorized GitHub Apps
              </span>
              , then remove this wizard.
            </p>
            <a
              href={REVOKE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-block text-[13px] font-medium text-brand-hover underline"
            >
              Open Authorized GitHub Apps
            </a>
          </div>
        </>
      )}

      {auth.status === 'unavailable' && (
        <p className="mt-4 text-sm leading-relaxed text-fw-muted">
          Signing in isn&apos;t available in this local preview. You can carry on
          without it. Everything except sending your suggestion works.
        </p>
      )}
    </Card>
  )
}
