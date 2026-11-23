// Adding a new page to the docs' sidebar, in vocs.config.ts.
//
// The browser never sends this file. It says which page goes in and which
// sidebar entry it follows, and the line is written here, into the copy of the
// file the commit starts from. So a suggestion can add one line of the expected
// shape to the sidebar and nothing else: no other part of the site's config is
// within reach of the wizard.
//
// The line follows the contributing guide: new content goes in with
// `dev: true`, so it shows on the preview site and stays off the main one until
// a maintainer promotes it.

export interface SidebarLink {
  /** `/supply-chain/hardware-wallets` */
  link: string
  /** What the sidebar shows. */
  text: string
  /** The existing entry it goes after: `/supply-chain/dependency-awareness`.
   *  Or, for first in its section, `before`: the entry it goes in front of. */
  after?: string
  before?: string
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const linkRe = (link: string) => new RegExp(`\\blink:\\s*['"]${escapeRe(link)}['"]`)
const quote = (s: string) => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`
// An entry on one line, `{ text: 'Overview', link: '/x/overview' },` (maybe
// with a comment after it), or spread over several, from a `{` line to a `}`
// line, as some sections write theirs.
const ENTRY_RE = /^(\s*)\{.*\}\s*(,?)\s*(\/\/.*)?$/
const OPEN_RE = /^(\s*)\{\s*$/
const CLOSE_RE = /^\s*\}\s*(,?)\s*(\/\/.*)?$/

/** The lines of the entry holding line `at`: its first and last, and its indent. */
function entryAround(lines: string[], at: number): { first: number; last: number; indent: string } | null {
  const one = ENTRY_RE.exec(lines[at])
  if (one) return { first: at, last: at, indent: one[1] }
  let first = at
  while (first > 0 && !OPEN_RE.test(lines[first]) && at - first < 8) first--
  let last = at
  while (last < lines.length - 1 && !CLOSE_RE.test(lines[last]) && last - at < 8) last++
  const open = OPEN_RE.exec(lines[first])
  return open && CLOSE_RE.test(lines[last]) ? { first, last, indent: open[1] } : null
}

/** The config with each link added, or the reason it couldn't be, for the contributor. */
export function addSidebarLinks(config: string, links: SidebarLink[]): string | { error: string } {
  const lines = config.split('\n')
  const start = lines.findIndex((l) => /\bsidebar\s*:/.test(l))
  if (start < 0) return { error: 'The docs’ sidebar couldn’t be read. Please tell us on Discord.' }

  const added: string[] = []
  for (const l of links) {
    if (lines.some((x) => linkRe(l.link).test(x))) {
      return { error: `${l.link} is already in the sidebar.` }
    }
    const anchor = l.after || l.before || ''
    const found = anchor ? lines.findIndex((x, i) => i > start && linkRe(anchor).test(x)) : -1
    const entry = found >= 0 ? entryAround(lines, found) : null
    if (!entry) {
      return {
        error: `The page your new page was placed next to (${anchor}) has moved in the sidebar. Move it in Page details and send again.`,
      }
    }
    const line = `${entry.indent}{ text: ${quote(l.text)}, link: '${l.link}', dev: true },`
    if (l.after) {
      // The entry it follows may be the last in its list, written without a comma.
      lines[entry.last] = lines[entry.last].replace(/\}(\s*)(\/\/.*)?$/, (m, sp: string, c = '') =>
        m.startsWith('},') ? m : `},${sp}${c}`,
      )
      // Two new pages after the same one keep the order they were created in.
      let at = entry.last
      while (at + 1 < lines.length && added.some((a) => linkRe(a).test(lines[at + 1]))) at++
      lines.splice(at + 1, 0, line)
    } else {
      // In front of the section's first entry; a second one goes after the first.
      lines.splice(entry.first, 0, line)
    }
    added.push(l.link)
  }
  return lines.join('\n')
}
