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
// hand, and three of its six lines don't survive contact with this flow:
//
//   "tag current contributors from the attribution list" — the contributor
//   can't tag anyone; the wizard opens the PR. And they have no way of knowing
//   who is on the attribution list unless we show them. So we show them, by
//   name and face, and the wizard does the tagging.
//
//   "if there is a steward for that framework, ask the steward" — nobody
//   arriving here knows whether there is one, or what a steward is. But we can
//   find out: stewards carry a `Framework-Steward` badge in contributors.json,
//   and the badge names the framework. So we look one up and, if there is one,
//   the review request goes to them by name.
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
//   "if you're modifying the general outline, update vocs.config.ts with
//   dev: true" — editing a page can't change which pages exist or how they're
//   ordered. There is no version of this question that means anything here, so
//   it isn't asked, and the PR says the outline is untouched.
//
// What each choice maps to in the PR body is kept next to it, so the checklist
// a maintainer reads still reads like every other one they get.

export const STEWARDSHIP_URL = 'https://frameworks.securityalliance.org/contribute/stewards'
export const SPOTLIGHT_URL =
  'https://frameworks.securityalliance.org/contribute/spotlight-zone'
export const DISCORD_URL = 'https://discord.gg/securityalliance'

/**
 * The asks from the PR template that are genuinely the contributor's to answer.
 *
 * Mentioning the page's credited contributors and the framework's steward is
 * not among them — see the note at the top of this file. What's left is the two
 * things nobody can be volunteered into and one thing only they can attest to.
 */
export interface PrAnswers {
  /** Volunteer for stewardship — only offered when the framework has none. */
  stewardInterest?: boolean
  /** Share the PR in Discord to ask the wider community for feedback. */
  discord?: boolean
  /** "I've read my changes back." */
  typos?: boolean
}

// The template's own sentences, for the checklist in the PR body.
//
// Exported because the Send step draws a preview of the pull request from the
// same inputs `buildPrBody` uses. Two hand-written copies of these sentences
// would be two things to keep in step, and the preview would quietly stop being
// a preview the first time one of them was edited.
export const TEMPLATE_LINES = {
  describe: 'Describe your changes, substitute this text with the information',
  contributors:
    'If you are touching an existing piece of content, tag current contributors from the attribution list',
  steward: 'If there is a steward for that framework, ask the steward to review it',
  // Ours, not the template's, and it stands in for `steward` rather than
  // joining it. "If there is a steward, ask them" is an instruction with no
  // subject when the framework hasn't got one: it can only ever sit there
  // unticked, which reads as a step the contributor skipped rather than as one
  // that didn't apply. This says what is actually true of the framework, and
  // ticks for the only thing anyone could do about it.
  stewardInterest:
    'No steward looks after this framework yet, and the contributor has offered to take it on',
  discord:
    'If you need feedback for your content from the wider community, share the PR in our Discord',
  typos: 'Review changes to ensure there are no typos; see instructions below.',
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

export function buildPrBody({
  note,
  answers = {},
  current,
  contributors = [],
  stewards = [],
}: PrBodyInput): string {
  const tick = (on: boolean | undefined, line: string) => `- [${on ? 'x' : ' '}] ${line}`
  const mention = (people: Person[]) => people.map((p) => `@${p.slug}`).join(' ')

  const lines = [
    '## Frameworks PR Checklist',
    '',
    'Thank you for contributing to the Security Frameworks! This pull request was opened through the contribution wizard, so the checklist below reflects what the contributor chose and what the wizard did on their behalf.',
    '',
    tick(true, TEMPLATE_LINES.describe),
    '',
    note.trim() || '_No note given._',
    '',
    tick(contributors.length > 0, TEMPLATE_LINES.contributors),
    // One line or the other, never both — see TEMPLATE_LINES.stewardInterest.
    stewards.length > 0
      ? tick(true, TEMPLATE_LINES.steward)
      : tick(answers.stewardInterest, TEMPLATE_LINES.stewardInterest),
    tick(answers.discord, TEMPLATE_LINES.discord),
    tick(answers.typos, TEMPLATE_LINES.typos),
  ]

  if (current) {
    lines.push(
      '',
      `Page: [\`${current.rel}\`](https://github.com/${REPO}/blob/${BRANCH}/${current.path})`,
    )
  }

  // Both mention lines are unconditional when there are people to mention: the
  // Send step shows the contributor exactly who these are, and shows them this
  // body, so nobody is pulled into a thread the contributor couldn't see coming.
  if (contributors.length) {
    lines.push('', `Credited on this page: ${mention(contributors)}`)
  }
  if (stewards.length) {
    lines.push('', `Review requested from the framework steward: ${mention(stewards)}`)
  }
  // A framework with nobody looking after it, and someone in front of us who
  // just did the work. Per the stewardship page there's no application form —
  // the path is contributing and saying so, which is exactly this.
  if (answers.stewardInterest && stewards.length === 0 && current) {
    lines.push(
      '',
      `**${titleize(current.framework)} has no steward.** The contributor has expressed interest in taking it on. See [Stewardship](${STEWARDSHIP_URL}).`,
    )
  }

  lines.push(
    '',
    '---',
    '',
    'The wizard edits pages that already exist, so the outline in `vocs.config.ts` is untouched.',
  )
  return lines.join('\n')
}
