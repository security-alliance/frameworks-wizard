import { TagList } from '../site/tags/TagList'
import { ContributeFooter as SiteContributeFooter } from '../site/footer/ContributeFooter'
import type {
  ContributorDirectory,
  ContributorGroup,
  ContributorRecord,
} from '../../lib/types.js'

// What the preview renders where a page has a Vocs component.
//
// TagList and ContributeFooter are the docs site's own components, copied
// unchanged into ../site along with their stylesheets, so the preview matches
// the live site as long as those copies are kept in sync. Their CSS keys dark
// mode off `:root[data-vocs-theme='dark']`, which `useTheme` stamps for exactly
// this reason.
//
// AttributionList below is still a local approximation, because the real one
// imports `vocs` (not a dependency here) and reads contributors.json at build
// time, while the wizard fetches that directory live from `develop`.
export { TagList }

const SITE_URL = 'https://frameworks.securityalliance.org'

// Mirrors components/attribution/AttributionList.tsx: a bordered card with role
// sections ("Authored by", "Reviewed by", "Fact-checked by"), each listing
// contributors with avatar, name, GitHub link, and company.
const ROLE_ALIASES: Record<string, string> = {
  wrote: 'Authored by',
  reviewed: 'Reviewed by',
  'fact-checked': 'Fact-checked by',
}

const CONTRIBUTING_URL =
  'https://frameworks.securityalliance.org/contribute/contributing'

// Resolve a role's handles against the directory.
//
// The live site treats a slug that isn't in contributors.json as not a
// contributor at all — `getContributor` returns null and the name is dropped.
// This mirrors that, with one deliberate exception: the site imports
// contributors.json at build time and so always has it, while the wizard
// fetches it best-effort (`fetchContributors` returns {} on failure). If that
// fetch hasn't landed yet, every slug looks unknown, and mirroring strictly
// would tell a contributor "No contributors yet" on a page that plainly credits
// people. So while the directory is empty we keep showing the handles; once it
// has loaded, unknown slugs drop out exactly as they do on the site.
function resolveRole(
  slugs: string[],
  data: ContributorDirectory | undefined,
): ContributorRecord[] {
  const directoryLoaded = Object.keys(data ?? {}).length > 0
  const out: ContributorRecord[] = []
  for (const slug of slugs) {
    const found = data?.[slug]
    if (found) out.push(found)
    else if (!directoryLoaded) {
      out.push({
        name: slug,
        avatar: `https://avatars.githubusercontent.com/${slug}`,
        github: `https://github.com/${slug}`,
      })
    }
  }
  return out
}

export function AttributionList({
  contributors,
  contributorData,
}: {
  contributors?: ContributorGroup[]
  contributorData?: ContributorDirectory
}) {
  const roleGroups = Array.isArray(contributors) ? contributors : []
  const sections = roleGroups
    .map((group) => ({
      role: group.role ?? '',
      people: resolveRole(group.users ?? [], contributorData),
    }))
    .filter((s) => s.people.length > 0)

  // A page nobody is credited on says so, and points at how to change that —
  // the same invitation the live site makes.
  if (sections.length === 0) {
    return (
      <div className="my-6 rounded-lg border border-white/10 bg-white/4 p-5 text-center">
        <p className="fw-attribution-empty py-2 text-sm text-fw-faint">
          No contributors yet.{' '}
          <a
            href={CONTRIBUTING_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-blue-400 hover:underline"
          >
            Be the first to contribute
          </a>
          !
        </p>
      </div>
    )
  }

  return (
    <div className="my-6 rounded-lg border border-white/10 bg-white/4 p-5">
      {sections.map(({ role, people }, gi) => {
        return (
          <div
            key={gi}
            className="flex flex-col gap-3 not-last:mb-4 sm:flex-row sm:items-start sm:gap-4"
          >
            {/* Type styles live on `.fw-role-title` in index.css, not in
                utilities here: the preview's `.prose-preview h4` rule outranks
                a single utility class, and its heading margin would drop this
                label a line below the avatars it labels. */}
            <h4 className="fw-role-title shrink-0 sm:min-w-30">
              {ROLE_ALIASES[role] || role}:
            </h4>
            <div className="flex flex-1 flex-wrap gap-x-4 gap-y-3">
              {people.map((c, i) => (
                <div key={i} className="flex items-center gap-2.5">
                  {c.avatar && (
                    <img
                      src={c.avatar}
                      alt={c.name}
                      className="h-8 w-8 rounded-full border-2 border-white/10 object-cover"
                      onError={(e) => {
                        e.currentTarget.style.visibility = 'hidden'
                      }}
                    />
                  )}
                  <div className="min-w-0 leading-tight">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-medium text-fw-text">{c.name}</span>
                      {c.github && (
                        <a
                          href={c.github}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="GitHub"
                          className="text-fw-faint hover:text-fw-text"
                        >
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
                          </svg>
                        </a>
                      )}
                    </div>
                    {c.company && (
                      <div className="text-xs text-fw-faint">{c.company}</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// The real footer, with the one prop the wizard has to override.
//
// `learnMoreUrl` defaults to the root-relative `/contribute/contributing`,
// which on the live site is a page and inside the wizard is a route that
// doesn't exist — clicking it would navigate the SPA away mid-edit. Pointing it
// at the live site keeps the link meaning what it says.
//
// `contributeUrl` is left alone: the real component appends the current
// pathname to it, and the wizard is served from `/`, so it resolves to the
// docs/pages tree.
export function ContributeFooter() {
  return <SiteContributeFooter learnMoreUrl={`${SITE_URL}/contribute/contributing`} />
}

export function UnknownComponent({ name }: { name: string }) {
  return (
    <div className="my-2 rounded-md border border-dashed border-fw-border bg-fw-surface-2/30 px-3 py-1.5 text-xs text-fw-faint">
      {name} renders on the live site
    </div>
  )
}
