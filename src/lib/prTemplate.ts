import { REPO, BRANCH } from './github.js'
import { titleize } from './format.js'
import type {
  ContributorDirectory,
  Frontmatter,
  PageEntry,
  Person,
} from './types.js'

// The pull request the wizard opens, and the questions it asks to build it.
//
// The repo's PULL_REQUEST_TEMPLATE.md is written for someone opening a PR by
// hand, and three of its "If applicable" lines don't survive contact with this
// flow:
//
//   "Editing existing content: tagged the current contributors from the
//   attribution list" — the contributor can't tag anyone; the wizard opens the
//   PR. And they have no way of knowing who is on the attribution list unless
//   we show them. So we show them, by name and face, and the wizard does the
//   tagging.
//
//   "Framework has a steward: asked them to review" — nobody arriving here
//   knows whether there is one, or what a steward is. But we can find out:
//   stewards carry a `Framework-Steward` badge in contributors.json, and the
//   badge names the framework. So we look one up and, if there is one, the
//   review request goes to them by name.
//
// Neither of those is a question, and a checkbox, even one ticked by default,
// is the wrong shape for what's being asked:
//
//   - the template *instructs* it. It's the project's rule, and asking a
//     newcomer for permission to follow it invites them to say no to something
//     that isn't optional.
//   - they have nothing to decide with. They don't know these people, and can't
//     weigh whether a mention is welcome. A choice with no information behind it
//     isn't a choice, it's a decision tax paid by the person least equipped.
//   - the stakes are lopsided. The cost is one notification on a repo they
//     already watch; the benefit is that the people who can actually review the
//     change find out it exists.
//
// So the wizard does it, and *says* it does it — by name and face, with the
// mention line visible in the preview of the pull request itself. Transparency
// instead of a toggle.
//
//   "Outline change: updated `vocs.config.ts` with the `dev: true` parameter"
//   — editing a page can't change which pages exist or how they're ordered.
//   There is no version of this question that means anything here, so it isn't
//   asked, and the line is left out.
//
// The body follows the template's own sections, in the template's words, so it
// reads like every other pull request a maintainer gets. Only lines that apply
// are listed: in a generated pull request, an unticked line says nothing.

// People are only @mentioned on the real repo. A test copy carries the real
// pages, and with them the real people's handles, so a mention there would
// notify them about a test. Anywhere else the handle is written without the @,
// which GitHub doesn't treat as a mention. Keyed on the repo itself rather than
// a setting, so nobody can ping anyone by forgetting to set it.
export const MENTIONS = REPO === 'security-alliance/frameworks'

/** `@octocat` on the real repo, plain `octocat` everywhere else. */
export const handle = (slug: string) => (MENTIONS ? `@${slug}` : slug)

export const STEWARDSHIP_URL = 'https://frameworks.securityalliance.org/contribute/stewards'
export const SPOTLIGHT_URL =
  'https://frameworks.securityalliance.org/contribute/spotlight-zone'
export const DISCORD_URL = 'https://discord.gg/securityalliance'

/**
 * The asks from the PR template that are genuinely the contributor's to answer.
 *
 * Mentioning the page's credited contributors and the framework's steward is
 * not among them — see the note at the top of this file. Nor is sharing the PR
 * in Discord: that's a link on the Done step, once there is a PR to share.
 * What's left is the one thing nobody can be volunteered into.
 */
export interface PrAnswers {
  /** Volunteer for stewardship — only offered when the framework has none. */
  stewardInterest?: boolean
}

// The template's own sentences (security-alliance/frameworks#535), for the
// PR body. One section heading per template section.
export const TEMPLATE_SECTIONS = {
  change: 'What does this PR change?',
  type: 'Type of change',
  applicable: 'If applicable',
}

export const TEMPLATE_LINES = {
  // The wizard only ever edits a page that exists.
  type: 'Edit to existing content',
  contributors: 'Editing existing content: tagged the current contributors from the attribution list',
  steward: 'Framework has a steward: asked them to review',
}

/* ------------------------------------------------------------------ *
 * who's involved
 * ------------------------------------------------------------------ */

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')

// Two frameworks are filed under a folder name that isn't their title. Spelled
// out rather than fuzzy-matched: a near-miss here would put the wrong person's
// name in front of a contributor, and there are only two.
const FRAMEWORK_ALIASES: Record<string, string> = {
  opsec: 'operationalsecurity',
  certs: 'sealcerts',
}

/** People credited on the page, resolved against the contributor directory. */
export function pageContributors(
  fm: Frontmatter | null | undefined,
  directory: ContributorDirectory = {},
): Person[] {
  const slugs = new Set<string>()
  for (const group of fm?.contributors ?? []) {
    for (const user of group.users ?? []) if (user) slugs.add(user)
  }
  return [...slugs].map((slug) => person(slug, directory))
}

/**
 * The steward(s) for a framework, or [] if it doesn't have one.
 *
 * Stewards are designated by a `Framework-Steward` badge in contributors.json
 * that names the framework they look after — the same record the Spotlight Zone
 * is built from, so this can't go stale separately from the site.
 */
export function frameworkStewards(
  directory: ContributorDirectory | null | undefined,
  framework: string | null | undefined,
): Person[] {
  if (!directory || !framework) return []
  const want = FRAMEWORK_ALIASES[framework] ?? norm(framework)

  const found: Person[] = []
  for (const [slug, entry] of Object.entries(directory)) {
    for (const badge of entry?.badges ?? []) {
      if (badge?.name !== 'Framework-Steward' || !badge.framework) continue
      if (norm(badge.framework) === want) found.push(person(slug, directory))
    }
  }
  return found
}

function person(slug: string, directory: ContributorDirectory): Person {
  const found = directory?.[slug]
  return {
    slug,
    name: found?.name || slug,
    avatar: found?.avatar || `https://avatars.githubusercontent.com/${slug}`,
  }
}

/* ------------------------------------------------------------------ *
 * the pull request
 * ------------------------------------------------------------------ */

/** `docs(opsec): update Travel Security Guide` — the repo's commit convention. */
export function buildPrTitle(current: PageEntry | null | undefined): string {
  if (!current) return 'docs: update page'
  return `docs(${current.framework}): update ${titleize(current.name)}`
}

export interface PrBodyInput {
  /** What the contributor wrote. */
  note: string
  answers?: PrAnswers
  current?: PageEntry | null
  /** People credited on the page. */
  contributors?: Person[]
  /** The framework's stewards, if any. */
  stewards?: Person[]
}

/** One line naming people: "Review requested from the ENS steward: @ghadi8". */
export interface PeopleLine {
  label: string
  people: Person[]
}

/**
 * The pull request's body, as parts. `buildPrBody` writes them out as markdown
 * and the Send step's preview draws them, so the two can't disagree.
 */
export interface PrParts {
  note: string
  page?: { rel: string; url: string }
  /** Who is asked to review, then who else is credited. Each person once. */
  people: PeopleLine[]
  /** The framework has no steward, and the contributor offered to be one. */
  volunteer: boolean
  /** The "If applicable" lines that apply. All ticked; the rest are left out. */
  applicable: string[]
  /** Said once, in italics, at the very end. */
  footer: string
}

export function prParts({
  note,
  answers = {},
  current,
  contributors = [],
  stewards = [],
}: PrBodyInput): PrParts {
  // A steward who is also credited on the page is named once, as the steward:
  // the review request is the line that asks something of them. The framework
  // isn't named: the page line right above says which it is.
  const stewardSlugs = new Set(stewards.map((p) => p.slug))
  const others = contributors.filter((p) => !stewardSlugs.has(p.slug))
  const people: PeopleLine[] = []
  if (stewards.length) {
    people.push({
      label: `Review requested from the framework steward${stewards.length === 1 ? '' : 's'}`,
      people: stewards,
    })
  }
  if (others.length) {
    people.push({
      label: stewards.length ? 'Also credited on this page' : 'Credited on this page',
      people: others,
    })
  }

  return {
    note: note.trim(),
    page: current
      ? { rel: current.rel, url: `https://github.com/${REPO}/blob/${BRANCH}/${current.path}` }
      : undefined,
    people,
    // A framework with nobody looking after it, and someone in front of us who
    // just did the work. Per the stewardship page there's no application form —
    // the path is contributing and saying so, which is exactly this.
    volunteer: !!answers.stewardInterest && stewards.length === 0,
    applicable: [
      contributors.length > 0 && TEMPLATE_LINES.contributors,
      stewards.length > 0 && TEMPLATE_LINES.steward,
    ].filter((line): line is string => !!line),
    footer: MENTIONS
      ? 'Sent with the Frameworks contribution wizard.'
      : 'Sent with the Frameworks contribution wizard. On this test copy, names are written without @, so nobody is notified.',
  }
}

// What the contributor wrote comes first, under the template's own heading,
// with who's being asked right after it; then the checklist; then one line
// saying where the pull request came from. That line stays the last
// paragraph: the backend puts its conflict warning just above it.
export function buildPrBody(input: PrBodyInput): string {
  const p = prParts(input)
  const mention = (people: Person[]) => people.map((x) => handle(x.slug)).join(' ')

  const lines = [`### ${TEMPLATE_SECTIONS.change}`, '', p.note || '_No note given._', '']
  if (p.page) lines.push(`- **Page:** [\`${p.page.rel}\`](${p.page.url})`)
  for (const line of p.people) lines.push(`- **${line.label}:** ${mention(line.people)}`)
  if (p.volunteer) {
    lines.push(
      '',
      `**This framework has no steward yet.** The contributor has offered to take it on. See [Stewardship](${STEWARDSHIP_URL}).`,
    )
  }

  lines.push('', `### ${TEMPLATE_SECTIONS.type}`, '', `- [x] ${TEMPLATE_LINES.type}`)
  if (p.applicable.length) {
    lines.push('', `### ${TEMPLATE_SECTIONS.applicable}`, '', ...p.applicable.map((l) => `- [x] ${l}`))
  }

  lines.push('', `_${p.footer}_`)
  return lines.join('\n')
}
