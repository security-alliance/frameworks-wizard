import { titleize } from './format.js'
import type { PageEntry, PageSegment } from './types.js'

// Group a framework's pages into contiguous subfolder segments, preserving
// sidebar order. Root-level pages get an empty label.
export function toSegments(pages: PageEntry[]): PageSegment[] {
  const segments: PageSegment[] = []
  let cur: PageSegment | null = null
  for (const p of pages) {
    const key = p.subdir.join('/')
    if (!cur || cur.key !== key) {
      cur = { key, label: p.subdir.map(titleize).join(' / '), pages: [] }
      segments.push(cur)
    }
    cur.pages.push(p)
  }
  return segments
}
