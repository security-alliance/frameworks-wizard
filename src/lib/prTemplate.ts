import { REPO, BRANCH } from './github.js'
import type {
  ContributorDirectory,
  Frontmatter,
  PageEntry,
  Person,
} from './types.js'

// The pull request the wizard opens, and the questions it asks to build it.
//
// The repo's PULL_REQUEST_TEMPLATE.md is written for someone opening a PR by
// hand, and some of its "If applicable" lines don't survive contact with this
// flow:
//
//   "Framework has a steward: asked them to review" — nobody arriving here
//   knows whether there is one, or what a steward is. But we can find out:
//   stewards carry a `Framework-Steward` badge in contributors.json, and the
//   badge names the framework. So we look one up and, if there is one, the
//   review request goes to them by name. That isn't a question either: it's
//   the project's rule, and the contributor has nothing to decide it with.
//
//   "Editing existing content: tagged the current contributors from the
//   attribution list" — deliberately not done. A suggestion can span several
//   pages, and tagging everyone credited on each would ping a dozen people
//   about a typo. Only the steward, whose review is needed, is mentioned. The
//   people credited on the pages are still named, without the @, so a
//   maintainer can see who to loop in when it matters.
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

/** A page in the suggestion, with how much of it changed. */
export interface PrPage {
  page: PageEntry
  added: number
  removed: number
}

/**
 * `docs(opsec): update Travel Security Guide`, the repo's commit convention.
 *
 * Several pages: `docs(opsec): update 3 pages`, and `… across 2 frameworks`
 * when they span frameworks, scoped to the framework with the most changed
 * lines. A maintainer can retitle it; the title says it spans frameworks so
 * they know to look.
 */
export function buildPrTitle(pages: PrPage[]): string {
  if (pages.length === 0) return 'docs: update page'
  if (pages.length === 1) return `docs(${pages[0].page.framework}): update ${pages[0].page.title}`
  const lines = new Map<string, number>()
  for (const p of pages) {
    lines.set(p.page.framework, (lines.get(p.page.framework) ?? 0) + p.added + p.removed)
  }
  // Map order is first-seen, so a tie goes to the first page in the list.
  let scope = pages[0].page.framework
  for (const [fw, n] of lines) if (n > lines.get(scope)!) scope = fw
  const across = lines.size > 1 ? ` across ${lines.size} frameworks` : ''
  return `docs(${scope}): update ${pages.length} pages${across}`
}

/** A framework's stewards, as found by `frameworkStewards`. */
export interface StewardGroup {
  /** The framework's name: "ENS". */
  framework: string
  people: Person[]
}

export interface PrBodyInput {
  /** What the contributor wrote. */
  note: string
  pages: PageEntry[]
  /** Stewards of the frameworks the pages are in, one group per framework. */
  stewards?: StewardGroup[]
  /** People credited on the pages, named but not notified. */
  credited?: Person[]
  /** The framework the contributor offered to look after, if they did. */
  volunteer?: string | null
}

/** One line naming people: "Review requested from the ENS steward: @ghadi8". */
export interface PeopleLine {
  label: string
  people: Person[]
  /** Whether they're @mentioned. Only stewards are. */
  notify: boolean
}

/**
 * The pull request's body, as parts. `buildPrBody` writes them out as markdown
 * and the Send step's preview draws them, so the two can't disagree.
 */
export interface PrParts {
  note: string
  pages: { rel: string; url: string }[]
  /** Who is asked to review, then who else is credited. Each person once. */
  people: PeopleLine[]
  /** The framework the contributor offered to steward. */
  volunteer: string | null
  /** The "If applicable" lines that apply. All ticked; the rest are left out. */
  applicable: string[]
  /** Said once, in italics, at the very end. */
  footer: string
}

export function prParts({
  note,
  pages,
  stewards = [],
  credited = [],
  volunteer = null,
}: PrBodyInput): PrParts {
  const groups = stewards.filter((g) => g.people.length)
  const stewardSlugs = new Set(groups.flatMap((g) => g.people.map((p) => p.slug)))
  const people: PeopleLine[] = []
  // One framework: the page line says which, so it isn't named. Several: each
  // steward under their own framework.
  for (const g of groups) {
    const s = g.people.length === 1 ? '' : 's'
    people.push({
      label:
        stewards.length === 1
          ? `Review requested from the framework steward${s}`
          : `Review requested from the ${g.framework} steward${s}`,
      people: g.people,
      notify: true,
    })
  }
  // A steward who is also credited is named once, as the steward.
  const others = credited.filter((p) => !stewardSlugs.has(p.slug))
  if (others.length) {
    people.push({
      label: `Credited on ${pages.length === 1 ? 'this page' : 'these pages'} (not notified)`,
      people: others,
      notify: false,
    })
  }

  return {
    note: note.trim(),
    pages: pages.map((p) => ({ rel: p.rel, url: `https://github.com/${REPO}/blob/${BRANCH}/${p.path}` })),
    people,
    // A framework with nobody looking after it, and someone in front of us who
    // just did the work. Per the stewardship page there's no application form —
    // the path is contributing and saying so, which is exactly this.
    volunteer,
    applicable: groups.length ? [TEMPLATE_LINES.steward] : [],
    footer: MENTIONS
      ? 'Sent with the Frameworks contribution wizard.'
      : 'Sent with the Frameworks contribution wizard. On this test copy, names are written without @, so nobody is notified.',
  }
}

/** How a person is written in the body: @mentioned, or the plain handle. */
export const written = (p: Person, notify: boolean) => (notify ? handle(p.slug) : p.slug)

// What the contributor wrote comes first, under the template's own heading,
// with who's being asked right after it; then the checklist; then one line
// saying where the pull request came from. That line stays the last
// paragraph: the backend puts its conflict warning just above it.
export function buildPrBody(input: PrBodyInput): string {
  const p = prParts(input)

  const lines = [`### ${TEMPLATE_SECTIONS.change}`, '', p.note || '_No note given._', '']
  const link = (x: { rel: string; url: string }) => `[\`${x.rel}\`](${x.url})`
  if (p.pages.length === 1) lines.push(`- **Page:** ${link(p.pages[0])}`)
  else if (p.pages.length > 1) {
    lines.push('- **Pages:**', ...p.pages.map((x) => `  - ${link(x)}`))
  }
  for (const line of p.people) {
    lines.push(`- **${line.label}:** ${line.people.map((x) => written(x, line.notify)).join(' ')}`)
  }
  if (p.volunteer) {
    lines.push(
      '',
      `**${p.volunteer} has no steward yet.** The contributor has offered to take it on. See [Stewardship](${STEWARDSHIP_URL}).`,
    )
  }

  lines.push('', `### ${TEMPLATE_SECTIONS.type}`, '', `- [x] ${TEMPLATE_LINES.type}`)
  if (p.applicable.length) {
    lines.push('', `### ${TEMPLATE_SECTIONS.applicable}`, '', ...p.applicable.map((l) => `- [x] ${l}`))
  }

  lines.push('', `_${p.footer}_`)
  return lines.join('\n')
}
