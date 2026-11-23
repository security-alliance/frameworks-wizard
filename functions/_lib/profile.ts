// A contributor's profile in docs/pages/config/contributors.json: who the
// Spotlight Zone shows, with the badges their merged suggestions earn, and who a
// page's `wrote` list can name.
//
// The browser sends only what the contributor typed. Everything that says who
// they are (the key, the GitHub link, the avatar) comes from their session, and
// what only maintainers give (the role, the badges) is fixed: `contributor`,
// none yet. The entry is appended the way a hand-written PR adds one (#683).

export const CONTRIBUTORS_FILE = 'docs/pages/config/contributors.json'

export interface ProfileInput {
  name: string
  job_title: string
  company: string
  website: string
  twitter: string
  description: string
}

const DEFAULT_DESCRIPTION = 'Frameworks Contributor'

const text = (v: unknown, max: number) =>
  typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max) : ''

/** The fields as sent, checked; a string is the reason they were refused. */
export function readProfile(raw: unknown): ProfileInput | string {
  if (!raw || typeof raw !== 'object') return 'The profile couldn’t be read.'
  const r = raw as Record<string, unknown>
  const website = text(r.website, 200)
  if (website) {
    try {
      const u = new URL(website)
      if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new Error()
    } catch {
      return 'The website in your profile isn’t a web address.'
    }
  }
  const twitter = text(r.twitter, 200)
  if (twitter && !twitterHandle(twitter)) return 'The X / Twitter handle in your profile isn’t one.'
  return {
    name: text(r.name, 80),
    job_title: text(r.job_title, 80),
    company: text(r.company, 80),
    website,
    twitter,
    description: text(r.description, 160),
  }
}

/** `@octocat`, `octocat` or a twitter.com / x.com link → `octocat`. */
function twitterHandle(v: string): string | null {
  const m = /^(?:https?:\/\/(?:www\.)?(?:twitter|x)\.com\/)?@?([A-Za-z0-9_]{1,15})\/?$/.exec(v)
  return m ? m[1] : null
}

/** The profile's key, which `wrote` lists name it by: the login, lowercased, as the file does. */
export const profileSlug = (login: string) => login.toLowerCase()

const githubUrl = (login: string) => `https://github.com/${login}`

/** Whether the file already has a profile for this GitHub account. */
export function hasProfile(file: string, login: string): boolean {
  const want = githubUrl(login).toLowerCase()
  try {
    const all = JSON.parse(file) as Record<string, { github?: string | null }>
    return Object.values(all).some((p) => p?.github?.toLowerCase().replace(/\/+$/, '') === want)
  } catch {
    return false
  }
}

/**
 * The file with the contributor's profile appended, or null when it can't
 * be: the file isn't the JSON it should be, or their key belongs to someone
 * else already.
 */
export function addProfile(file: string, login: string, p: ProfileInput): string | null {
  let all: Record<string, unknown>
  try {
    all = JSON.parse(file)
  } catch {
    return null
  }
  const slug = profileSlug(login)
  if (slug in all) return null
  const handle = p.twitter ? twitterHandle(p.twitter) : null
  const entry = {
    slug,
    name: p.name || login,
    avatar: `https://avatars.githubusercontent.com/${login}`,
    github: githubUrl(login),
    twitter: handle ? `https://twitter.com/${handle}` : null,
    website: p.website || null,
    company: p.company || null,
    job_title: p.job_title || null,
    role: 'contributor',
    description: p.description || DEFAULT_DESCRIPTION,
    badges: [],
  }
  // After the last entry's closing brace, in the file's own two-space style.
  const end = file.lastIndexOf('}')
  const last = file.slice(0, end).search(/\}\s*$/)
  if (end < 0 || last < 0) return null
  const block = JSON.stringify(entry, null, 2).replace(/\n/g, '\n  ')
  return `${file.slice(0, last + 1)},\n  ${JSON.stringify(slug)}: ${block}\n${file.slice(end)}`
}
