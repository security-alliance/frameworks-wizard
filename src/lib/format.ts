// Keyboard shortcuts as each platform writes them. TipTap names them `Mod-Alt-0`
// (Mod is ⌘ on a Mac and Ctrl elsewhere); a Mac shows ⌘⌥0, everything else
// Ctrl+Alt+0. Worked out once, so the style menu and the tooltips agree.
const IS_MAC =
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad/i.test(navigator.userAgent)

const MAC_KEYS: Record<string, string> = { Mod: '⌘', Alt: '⌥', Shift: '⇧', Ctrl: '⌃' }
const PC_KEYS: Record<string, string> = { Mod: 'Ctrl', Alt: 'Alt', Shift: 'Shift', Ctrl: 'Ctrl' }

export function shortcut(keys: string): string {
  const parts = keys.split('-').map((k) => (k.length === 1 ? k.toUpperCase() : k))
  return IS_MAC
    ? parts.map((k) => MAC_KEYS[k] ?? k).join('')
    : parts.map((k) => PC_KEYS[k] ?? k).join('+')
}

// Turn a slug like "ai-security" or "prompt-injection-defenses" into a
// human-readable title.
export function titleize(slug: string): string {
  return slug
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}
