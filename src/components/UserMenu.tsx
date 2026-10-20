import { useEffect, useRef, useState } from 'react'
import { ChevronDown, SignOutIcon, ExternalIcon } from './ui.js'
import { REVOKE_URL } from '../lib/github.js'
import type { AuthUser } from '../lib/types.js'

// Signed-in identity in the header: avatar button, click for name / profile /
// sign out. Present on every step once signed in, so the contributor can always
// see who the change will be credited to.
export default function UserMenu({
  user,
  onSignOut,
}: {
  user: AuthUser
  onSignOut: () => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // Close on outside click or Escape — a menu you can't dismiss is worse than
  // no menu.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const name = user.name || user.login

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Account menu for ${name}`}
        className="flex items-center gap-1.5 rounded-full border border-fw-border bg-fw-surface-2/60 py-1 pl-1 pr-2 transition-colors hover:border-brand/60"
      >
        <Avatar user={user} className="h-7 w-7" />
        <ChevronDown className={`text-fw-faint transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div
          role="menu"
          className="fw-card-shadow absolute right-0 z-50 mt-2 w-60 overflow-hidden rounded-xl border border-fw-border bg-fw-surface"
        >
          <div className="flex items-center gap-3 border-b border-fw-border px-4 py-3">
            <Avatar user={user} className="h-10 w-10" />
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-fw-strong">{name}</div>
              <div className="truncate text-xs text-fw-faint">@{user.login}</div>
            </div>
          </div>

          <p className="border-b border-fw-border px-4 py-2.5 text-[11px] leading-relaxed text-fw-faint">
            Your suggestion will be credited to this account.
          </p>

          <a
            href={`https://github.com/${user.login}`}
            target="_blank"
            rel="noopener noreferrer"
            role="menuitem"
            className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-fw-muted hover:bg-fw-surface-2 hover:text-fw-text"
          >
            <ExternalIcon width="16" height="16" /> View profile
          </a>
          <button
            role="menuitem"
            onClick={() => {
              setOpen(false)
              onSignOut()
            }}
            className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm text-fw-muted hover:bg-fw-surface-2 hover:text-fw-text"
          >
            <SignOutIcon width="16" height="16" /> Sign out
          </button>

          {/* Sign out ends the session; revoking is what removes the app's
              access to the account, and it can only happen on GitHub. Someone
              looking for it will look here, next to sign out. */}
          <a
            href={REVOKE_URL}
            target="_blank"
            rel="noopener noreferrer"
            role="menuitem"
            className="block border-t border-fw-border px-4 py-2.5 text-[11px] leading-relaxed text-fw-faint hover:bg-fw-surface-2 hover:text-fw-muted"
          >
            To withdraw this app&apos;s access entirely, revoke it on GitHub:
            Settings → Applications → Authorized GitHub Apps.
          </a>
        </div>
      )}
    </div>
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
