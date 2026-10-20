import { load } from 'js-yaml'
import type { Frontmatter } from './types.js'

// Parse the raw YAML frontmatter string into an object. Used only to feed the
// preview components (tags, contributors) — the raw string remains the source
// of truth and is never rewritten.
export function parseFrontmatter(raw: string | null | undefined): Frontmatter {
  if (!raw) return {}
  try {
    return (load(raw) as Frontmatter | undefined) ?? {}
  } catch {
    return {}
  }
}
