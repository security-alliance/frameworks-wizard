// A page's headings, as markdown reads them.

export interface Heading {
  level: number
  text: string
}

const HEADING_LINE_RE = /^\s{0,3}(#{1,6})\s+(.*?)(?:\s+#+)?\s*$/
const FENCE_RE = /^\s*(`{3,}|~{3,})/

/** The headings in some page text, in order, skipping code blocks. */
export function headingsIn(text: string): Heading[] {
  const out: Heading[] = []
  let fence: string | null = null
  for (const line of text.split('\n')) {
    const f = line.match(FENCE_RE)
    if (f) {
      if (!fence) fence = f[1]
      else if (f[1][0] === fence[0] && f[1].length >= fence.length) fence = null
      continue
    }
    const h = !fence && line.match(HEADING_LINE_RE)
    if (h) out.push({ level: h[1].length, text: h[2] })
  }
  return out
}

/**
 * Headings that go more than one level below the heading before them, like a
 * `####` straight under a `##`. The docs' lint fails a page with one (MD001,
 * which counts from the page's first heading), and no page on `develop` has
 * one, so any found here came with the contribution.
 */
export function headingSkips(body: string): { heading: Heading; above: Heading }[] {
  const hs = headingsIn(body)
  const out: { heading: Heading; above: Heading }[] = []
  for (let i = 1; i < hs.length; i++) {
    if (hs[i].level > hs[i - 1].level + 1) out.push({ heading: hs[i], above: hs[i - 1] })
  }
  return out
}
