// The placeholders a new page starts with: grey hints in the editor that
// disappear as the contributor types and never reach the pull request.
//
// The editor works on markdown, one section at a time, and an empty heading or
// paragraph can't be written as markdown. So each placeholder is kept in the
// page's text as itself, and the editor (`Placeholders` in tiptapConfig.ts)
// shows any line that is exactly a placeholder, or ends with one, as empty,
// with the hint drawn in grey. While it's untouched it's written back as the
// hint, so a draft keeps the page's shape; once the contributor types, the
// line is theirs. At Send, `stripPlaceholders` takes out every one still left.
//
// Each is free of markdown characters the editor would escape. Short ones
// could occur in a real page, which is why a placeholder only counts at the
// end of its line, and why existing pages only ever lose the section-map row's
// (see `stripPlaceholders`).

export const PLACEHOLDERS = {
  takeaway: 'The one thing a reader should do differently after this page. Under 40 words.',
  intro: 'What the topic is, who it affects, and why it matters in Web3.',
  basicsHeading: 'Name the core idea',
  basics: 'The words and ideas the rest of the page builds on.',
  sectionHeading: 'Name the next section',
  section: 'The substance. Numbered lists when order matters, a checklist for things to tick off.',
  reading: 'A source behind a claim on this page, with a few words on why to read it',
  /** The row a new page gets in its section map: see sectionMap.ts. */
  mapRow: 'One line on what it covers, like the rows above',
} as const

export const PLACEHOLDER_TEXTS: string[] = Object.values(PLACEHOLDERS)

/** The ones a new page's own template has, as opposed to the section-map row. */
export const TEMPLATE_PLACEHOLDERS = PLACEHOLDER_TEXTS.filter((p) => p !== PLACEHOLDERS.mapRow)

// A placeholder can be wrapped over lines when an edit nearby re-wraps its
// section, so it's matched with any run of whitespace between its words.
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const placeholderRe = (p: string) => new RegExp(`${p.split(' ').map(escapeRe).join('\\s+')}(?=[ \\t]*$)`, 'gm')

/** How many placeholders are still in the text: parts left empty. */
export function placeholdersLeft(text: string, which: string[] = TEMPLATE_PLACEHOLDERS): number {
  return which.reduce((n, p) => n + (text.match(placeholderRe(p))?.length ?? 0), 0)
}

// What starts a markdown line without being text: heading hashes, quote
// marks, list markers.
const LINE_PREFIX = /^\s*(?:#{1,6}\s+|>\s*|[-*+]\s+|\d+[.)]\s+)*/
const DROP_LINE = '\u0000'
const CUT = '\u0001'

/** The two that come after real text on their line: the Key Takeaway label,
 *  a section-map row's link. The others are only ever a line of their own. */
export const FOLLOWS_TEXT: string[] = [PLACEHOLDERS.takeaway, PLACEHOLDERS.mapRow]

/** What an existing page can hold: only a new page's row in its section map. */
export const MAP_PLACEHOLDERS: string[] = [PLACEHOLDERS.mapRow]

/**
 * The text with the placeholders in `which` taken out, wherever one ends a
 * line. A line that was only a placeholder goes entirely (an empty heading or
 * bullet would publish as one); one at the end of a line, after the Key
 * Takeaway label or a section-map link, goes alone, with the map row's
 * dangling separator. A new page passes them all; an existing page only
 * `MAP_PLACEHOLDERS`, so its own text is never touched.
 */
export function stripPlaceholders(text: string, which: string[] = PLACEHOLDER_TEXTS): string {
  let out = text
  for (const p of which) {
    out = out.replace(placeholderRe(p), (match, offset: number, whole: string) => {
      const before = whole.slice(whole.lastIndexOf('\n', offset - 1) + 1, offset)
      if (before.replace(LINE_PREFIX, '').trim() === '') return DROP_LINE
      // Text before it: only a placeholder that follows text, or it's a
      // sentence that happens to end the same way.
      return FOLLOWS_TEXT.includes(p) ? CUT : match
    })
  }
  return out
    .split('\n')
    .filter((line) => !line.includes(DROP_LINE))
    .map((line) =>
      line.includes(CUT)
        ? line
            .replace(new RegExp(`\\s*${CUT}`), '')
            .replace(/\s+[—-]\s*$/, '')
            .replace(/\)\s*:\s*$/, ')')
            .trimEnd()
        : line,
    )
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
}
