// Turn a slug like "ai-security" or "prompt-injection-defenses" into a
// human-readable title.
export function titleize(slug: string): string {
  return slug
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}
