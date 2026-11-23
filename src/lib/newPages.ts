import { REPO, BRANCH, fetchRawPage, isEditablePage, splitFrontmatter } from './github.js'
import { parseFrontmatter } from './frontmatter.js'
import { PLACEHOLDERS } from './placeholders.js'

// Pages a contributor is writing from scratch, kept in this browser.
//
// A new page has nothing on GitHub to load, so the wizard keeps its own record
// of it: what the contributor said in the "New page" form, and the starter text
// the page began as. `loadPage` hands that starter to the editor wherever an
// existing page would come from GitHub, so everything downstream (drafts laid
// over the starter, Check's highlights, the diff, Send) works on a new page the
// same way it works on an existing one.
//
// The starter is stored, not rebuilt: drafts point at its lines, so it must not
// change under them. The frontmatter is rebuilt from the form every time, which
// is safe because drafts only ever touch the body.

const KEY = 'fw-new-pages'
const DOCS_ROOT = 'docs/pages/'

export interface NewPage {
  path: string
  /** As the sidebar and the page title show it. Follows the page's own
   *  heading as it's edited. */
  title: string
  /** Asked for in Page details once there's a page to describe. */
  description: string
  /** Null until set: Page details pre-picks the folder's usual ones. */
  tags: string[] | null
  /** The sidebar entry the page goes after (`/supply-chain/dependency-awareness`),
   *  or '' for first in its folder. */
  after: string
  /** When first: the entry it goes before. */
  before?: string
  /** The contributor chose to send it without a row in the section map. */
  mapSkipped?: boolean
  /** The page's body as created, before any edit. */
  starter: string
  createdAt: number
}

function readAll(): Record<string, NewPage> {
  try {
    const raw = localStorage.getItem(KEY)
    const all = raw ? (JSON.parse(raw) as Record<string, NewPage>) : {}
    return all && typeof all === 'object' ? all : {}
  } catch {
    return {}
  }
}

function writeAll(all: Record<string, NewPage>): boolean {
  try {
    if (Object.keys(all).length) localStorage.setItem(KEY, JSON.stringify(all))
    else localStorage.removeItem(KEY)
    return true
  } catch {
    return false
  }
}

export const listNewPages = (): NewPage[] =>
  Object.values(readAll()).sort((a, b) => a.createdAt - b.createdAt)

export const readNewPage = (path: string): NewPage | null => readAll()[path] ?? null

export function saveNewPage(page: NewPage): boolean {
  return writeAll({ ...readAll(), [page.path]: page })
}

export function removeNewPage(path: string): void {
  const all = readAll()
  delete all[path]
  writeAll(all)
}

/** The page as the editor starts from it: a new page's starter, or the page on GitHub. */
export async function loadPage(path: string): Promise<string> {
  const created = readNewPage(path)
  return created ? newPageRaw(created) : fetchRawPage(path)
}

/** The sidebar link for a page path: `docs/pages/a/b.mdx` → `/a/b`. */
export const linkOf = (path: string) => `/${path.slice(DOCS_ROOT.length).replace(/\.mdx$/, '')}`

/* ------------------------------------------------------------------ *
 * names
 * ------------------------------------------------------------------ */

/** "Hardware Wallets & Key Storage" → `hardware-wallets-key-storage`. */
export function slugify(title: string): string {
  return title
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/, '')
}

// The contributing guide's rule for names: kebab-case, normal dashes only.
// The server checks the same.
export const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

// Under 60 characters with the suffix, says the template. Past that it takes
// the short "| SEAL", so the title itself can run to 53.
const LONG_SUFFIX = ' | Security Alliance'
const SHORT_SUFFIX = ' | SEAL'
export const MAX_TITLE = 60 - SHORT_SUFFIX.length

export const pageTitle = (title: string) =>
  title.length + LONG_SUFFIX.length <= 60 ? `${title}${LONG_SUFFIX}` : `${title}${SHORT_SUFFIX}`

/** The template's description range. */
export const DESCRIPTION_RANGE = [140, 160] as const

/* ------------------------------------------------------------------ *
 * the file
 * ------------------------------------------------------------------ */

// YAML scalars only get quotes when they need them, the way the docs' own
// frontmatter writes tags. The title and description always have them, as in
// the template.
const yamlString = (s: string) => JSON.stringify(s)
const yamlPlain = (s: string) => (/^[\w(][\w\s/&().,+-]*$/.test(s) && !/\s$/.test(s) ? s : JSON.stringify(s))

/**
 * The frontmatter, in the template's shape. `wrote` is filled at Send, once it's
 * known whether the contributor has a profile to point at.
 */
export function buildFrontmatter(page: NewPage, wrote: string[] = []): string {
  return [
    `title: ${yamlString(pageTitle(page.title))}`,
    `description: ${yamlString(page.description.trim())}`,
    'tags:',
    ...(page.tags ?? []).map((t) => `  - ${yamlPlain(t)}`),
    'contributors:',
    '  - role: wrote',
    `    users: [${wrote.join(', ')}]`,
    '  - role: reviewed',
    '    users: []',
    '  - role: fact-checked',
    '    users: []',
  ].join('\n')
}

export const newPageRaw = (page: NewPage, wrote?: string[]) =>
  `---\n${buildFrontmatter(page, wrote)}\n---\n\n${page.starter}`

/**
 * The starter body: the structure of `docs/pages/config/template.mdx`, its
 * required sections, with a placeholder in each (see placeholders.ts). The only
 * real text is what's real on every page: the title, the components, the Key
 * Takeaway label and the "Further reading" heading.
 */
export function starterBody(path: string, title: string): string {
  // `../../../components` from a page one folder into a framework; one more
  // `../` for each folder deeper.
  const depth = path.slice(DOCS_ROOT.length).split('/').length - 1
  const components = `${'../'.repeat(depth + 2)}components`
  return [
    `import { TagList, AttributionList, ContributeFooter } from '${components}'`,
    '',
    `# ${title}`,
    '',
    '<TagList tags={frontmatter.tags} />',
    '<AttributionList contributors={frontmatter.contributors} />',
    '',
    `> 🔑 **Key Takeaway**: ${PLACEHOLDERS.takeaway}`,
    '',
    PLACEHOLDERS.intro,
    '',
    `## ${PLACEHOLDERS.basicsHeading}`,
    '',
    PLACEHOLDERS.basics,
    '',
    `## ${PLACEHOLDERS.sectionHeading}`,
    '',
    PLACEHOLDERS.section,
    '',
    '## Further reading',
    '',
    `- ${PLACEHOLDERS.reading}`,
    '',
    '---',
    '',
    '<ContributeFooter />',
    '',
  ].join('\n')
}

/* ------------------------------------------------------------------ *
 * tags
 * ------------------------------------------------------------------ */

/** Shown first in Page details; the rest are behind "More tags". */
export const PRIMARY_TAGS = ['Security Specialist', 'Operations & Strategy', 'Engineer/Developer', 'DevOps', 'SRE']

// What the template lists today, for when it can't be read.
const FALLBACK_TAGS = [
  'Security Specialist',
  'Operations & Strategy',
  'Engineer/Developer',
  'DevOps',
  'Protocol',
  'DAO',
  'DeFi',
  'Legal & Compliance',
  'Risk Management',
  'Smart Contracts',
]

let tagsPromise: Promise<string[]> | null = null

/** The existing tags, as the template lists them for contributors to pick from. */
export function fetchTags(): Promise<string[]> {
  tagsPromise ??= fetch(`https://raw.githubusercontent.com/${REPO}/${BRANCH}/docs/pages/config/template.mdx`)
    .then((r) => (r.ok ? r.text() : ''))
    .then((text) => {
      const block = /^tags:\s*\n([\s\S]*?)\n(?=[a-z_]+:)/m.exec(text)?.[1] ?? ''
      const tags = [...block.matchAll(/^\s+-\s+(.+?)\s*$/gm)].map((m) => m[1].replace(/^["']|["']$/g, ''))
      return tags.length ? tags : FALLBACK_TAGS
    })
    .catch(() => FALLBACK_TAGS)
  return tagsPromise
}

/** A path for a new page, if it's one the wizard and the server will accept. */
export function newPagePath(folder: string, slug: string): string | null {
  const path = `${DOCS_ROOT}${folder}/${slug}.mdx`
  return SLUG_RE.test(slug) && isEditablePage(path) ? path : null
}

/**
 * The two tags the section's other pages use most, to start a new page with.
 * Read from up to eight of them; [] if none could be read.
 */
export async function suggestTags(siblingPaths: string[]): Promise<string[]> {
  const pages = await Promise.all(
    siblingPaths.slice(0, 8).map((p) => fetchRawPage(p).catch(() => '')),
  )
  const counts = new Map<string, number>()
  for (const raw of pages) {
    const tags = parseFrontmatter(splitFrontmatter(raw).frontmatter).tags
    for (const t of Array.isArray(tags) ? tags : []) {
      if (typeof t === 'string') counts.set(t, (counts.get(t) ?? 0) + 1)
    }
  }
  return [...counts].sort((a, b) => b[1] - a[1]).slice(0, 2).map(([t]) => t)
}
