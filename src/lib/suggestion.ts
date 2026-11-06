import { useEffect, useState } from 'react'
import { fetchRawPage, splitFrontmatter } from './github.js'
import { parseFrontmatter } from './frontmatter.js'
import { isDirty, joinBlocks, splitBlocks, syncChecklistImport } from './blocks.js'
import { applyDraft, readDraft } from './drafts.js'
import type { DraftSummary } from './drafts.js'
import { computeDiffRows } from './diff.js'
import type { Block, Frontmatter } from './types.js'

// The pages of a suggestion, ready to send.
//
// The open page is what's on screen. Every other draft is only edits in this
// browser, so to send it, its page is loaded and the draft laid back over it,
// exactly as opening it in the editor would. A draft that no longer fits its
// page (the page changed on `develop`) isn't sent half-applied: it's marked
// `stale`, and opening it settles it, since the editor keeps only the edits
// that still fit.

export interface BuiltPage {
  path: string
  status: 'loading' | 'ready' | 'stale' | 'error'
  /** The whole file as loaded, and with the edit. Set once `ready`. */
  original?: string
  content?: string
  fm?: Frontmatter
  added: number
  removed: number
  sections: number
}

/** How much of a page changed. */
export function changes(originalBody: string, blocks: Block[]) {
  const d = computeDiffRows(originalBody, joinBlocks(blocks))
  return {
    added: d.added ?? 0,
    removed: d.removed ?? 0,
    sections: blocks.filter((b) => b.edited && b.text + b.trail !== b.raw).length,
  }
}

/** The whole file with the edited body; the frontmatter is kept byte for byte. */
export const withBody = (raw: string, body: string, blocks: Block[]) =>
  raw.slice(0, raw.length - body.length) + joinBlocks(blocks)

async function build(path: string): Promise<BuiltPage> {
  const empty = { path, added: 0, removed: 0, sections: 0 }
  const draft = readDraft(path)
  if (!draft) return { ...empty, status: 'error' }
  try {
    const raw = await fetchRawPage(path)
    const { frontmatter, body } = splitFrontmatter(raw)
    const r = applyDraft(splitBlocks(body), draft)
    const blocks = syncChecklistImport(r.blocks)
    if (r.skipped > 0 || !isDirty(blocks)) return { ...empty, status: 'stale' }
    return {
      path,
      status: 'ready',
      original: raw,
      content: withBody(raw, body, blocks),
      fm: parseFrontmatter(frontmatter),
      ...changes(body, blocks),
    }
  } catch {
    return { ...empty, status: 'error' }
  }
}

// One build per saved version of a draft, so switching steps doesn't refetch.
const cache = new Map<string, Promise<BuiltPage>>()

/** Every draft except `skip` (the open page), built for sending. */
export function useDraftPages(drafts: DraftSummary[], skip: string): Record<string, BuiltPage> {
  const [built, setBuilt] = useState<Record<string, BuiltPage>>({})
  const wanted = drafts.filter((d) => d.path !== skip)
  const key = wanted.map((d) => `${d.path}@${d.savedAt}`).join('|')

  useEffect(() => {
    let live = true
    for (const d of wanted) {
      const k = `${d.path}@${d.savedAt}`
      if (!cache.has(k)) cache.set(k, build(d.path))
      cache.get(k)!.then((page) => {
        if (live) setBuilt((b) => (b[d.path] === page ? b : { ...b, [d.path]: page }))
      })
    }
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  return built
}
