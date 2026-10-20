import UserMenu from './UserMenu.js'
import DraftsMenu from './DraftsMenu.js'
import { Collapse, SunIcon, MoonIcon } from './ui.js'
import type { AuthState } from '../lib/types.js'
import type { Theme } from '../lib/useTheme.js'
import type { DraftSummary } from '../lib/drafts.js'

const LOGO_URL =
  'https://frameworks-static.s3.us-east-2.amazonaws.com/images/logo/frameworks-full.svg'
const SITE_URL = 'https://frameworks.securityalliance.org'

// Top bar mirroring the live docs.
//
// No repo slug or target branch here: they're meaningless to the people this
// wizard is for, and where the change lands is the wizard's job to know, not
// the contributor's.
export default function BrandBar({
  auth,
  theme,
  onToggleTheme,
  minimal = false,
  drafts,
  currentPath,
  onOpenDraft,
  onDiscardDraft,
}: {
  auth: AuthState
  theme: Theme
  onToggleTheme: () => void
  drafts: DraftSummary[]
  currentPath: string
  onOpenDraft: (path: string) => void
  onDiscardDraft: (path: string) => void
  /** Focus mode. The logo stays — it's the one mark saying whose site this is,
   *  and a page with no header at all reads as something that has come loose
   *  rather than something you chose. Everything that invites you to go and do
   *  something else folds away. */
  minimal?: boolean
}) {
  return (
    <>
      <Collapse open={!minimal}>
        <div className="bg-brand px-4 py-1.5 text-center text-xs font-medium italic text-white">
          This is a work in progress and not a release. We are looking for
          volunteers.
        </div>
      </Collapse>

      <header
        className={`flex items-center justify-between gap-3 px-5 backdrop-blur transition-[padding,background-color] duration-300 ease-out motion-reduce:transition-none ${
          minimal
            ? 'bg-transparent py-2'
            : 'border-b border-fw-border-soft bg-fw-bg/70 py-3'
        }`}
      >
        <a
          href={SITE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2"
          title="Open the Frameworks site"
        >
          <img
            src={LOGO_URL}
            alt="SEAL Frameworks"
            className={`w-auto transition-[height] duration-300 ease-out motion-reduce:transition-none ${
              minimal ? 'h-7' : 'h-9 sm:h-11'
            }`}
            onError={(e) => {
              e.currentTarget.style.display = 'none'
            }}
          />
        </a>

        <Collapse open={!minimal}>
          <div className="flex items-center gap-2">
            <DraftsMenu
              drafts={drafts}
              currentPath={currentPath}
              onOpen={onOpenDraft}
              onDiscard={onDiscardDraft}
            />
          <button
            onClick={onToggleTheme}
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-fw-border bg-fw-surface-2/60 text-fw-muted transition-colors hover:border-brand/60 hover:text-fw-text"
          >
            {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
          </button>

            {auth.status === 'in' && auth.user && (
              <UserMenu user={auth.user} onSignOut={auth.signOut} />
            )}
          </div>
        </Collapse>
      </header>
    </>
  )
}
