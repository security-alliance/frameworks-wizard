import { useEffect, useId, useRef, useState } from 'react'
import { shortcut } from '../../lib/format.js'
import { CheckIcon, ChevronDown } from '../ui.js'
import type { Editor } from '@tiptap/react'

// What kind of line the cursor is on, and the control to change it. Always
// showing it is the point: an `####` heading looks almost like body text, and
// with only H2 and H3 buttons nothing said a line was one, nor offered a way
// back to text (PR #678). Google Docs and TipTap's own examples use the same
// pattern.
//
// Not a native <select>: its options can't show how big each style is or its
// shortcut, the same way in every browser. This is the WAI-ARIA "select-only
// combobox": a button that names the current style and opens a listbox.
//
// Only levels 2 to 4 are offered, the ones the docs use (H4 on about 28 of 453
// pages). The editor still reads every level (see `heading.levels` in
// tiptapConfig.ts), so a page with an `#####` loads as it is, and the trigger
// names it. Keeping headings in order is said in the help panel and the AI
// instructions, and Check warns about a skipped level, rather than greying out
// options here, which read as broken.

interface Style {
  level: 0 | 2 | 3 | 4
  label: string
  markdown: string
  keys: string
  /** The label drawn at roughly the style's own size and weight. */
  look: string
}

const STYLES: Style[] = [
  { level: 0, label: 'Normal text', markdown: '', keys: 'Mod-Alt-0', look: 'text-[0.875rem] font-normal' },
  { level: 2, label: 'Heading', markdown: '##', keys: 'Mod-Alt-2', look: 'text-[1.1875rem] font-semibold' },
  { level: 3, label: 'Subheading', markdown: '###', keys: 'Mod-Alt-3', look: 'text-[1.0313rem] font-semibold' },
  { level: 4, label: 'Small heading', markdown: '####', keys: 'Mod-Alt-4', look: 'text-[0.9063rem] font-semibold' },
]

export default function StyleMenu({ editor }: { editor: Editor | null }) {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const id = useId()

  const level = editor?.isActive('heading') ? Number(editor.getAttributes('heading').level) : 0
  const current = STYLES.find((s) => s.level === level)
  const label = current?.label ?? `Heading ${level}`
  const can = (s: Style) =>
    !!editor &&
    (s.level === 0 ? editor.can().setParagraph() : editor.can().setHeading({ level: s.level }))

  function openMenu() {
    if (!editor) return
    setActive(Math.max(0, STYLES.findIndex((s) => s.level === level)))
    setOpen(true)
  }

  function close(refocus: boolean) {
    setOpen(false)
    if (refocus) triggerRef.current?.focus()
  }

  function choose(s: Style) {
    if (!editor || !can(s)) return
    setOpen(false)
    // Back into the section before the change, so it counts as an edit: a
    // section only records changes made while it has focus (see ProseBlock),
    // and chaining `focus()` would only refocus on the next frame. `set*`, not
    // `toggle*`: picking the current style again leaves it alone rather than
    // turning a heading back into text.
    editor.view.focus()
    if (s.level === 0) editor.chain().setParagraph().run()
    else editor.chain().setHeading({ level: s.level }).run()
  }

  // While it's open the menu has the keyboard, wherever focus is: opened with
  // the mouse, focus stays in the section (so its selection survives), and the
  // arrows would otherwise move the caret there instead.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      const keys: Record<string, () => void> = {
        ArrowDown: () => setActive((i) => (i + 1) % STYLES.length),
        ArrowUp: () => setActive((i) => (i - 1 + STYLES.length) % STYLES.length),
        Home: () => setActive(0),
        End: () => setActive(STYLES.length - 1),
        Enter: () => choose(STYLES[active]),
        ' ': () => choose(STYLES[active]),
        Escape: () => close(document.activeElement === triggerRef.current),
        Tab: () => close(false),
      }
      const act = keys[e.key]
      if (act) {
        if (e.key !== 'Tab') {
          e.preventDefault()
          e.stopPropagation()
        }
        act()
        return
      }
      // A letter jumps to the style that starts with it.
      if (e.key.length === 1 && /\S/.test(e.key) && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const at = STYLES.findIndex((s) => s.label.toLowerCase().startsWith(e.key.toLowerCase()))
        if (at >= 0) {
          e.preventDefault()
          e.stopPropagation()
          setActive(at)
        }
      }
    }
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node
      if (!listRef.current?.contains(t) && !triggerRef.current?.contains(t)) setOpen(false)
    }
    window.addEventListener('keydown', onKey, true)
    document.addEventListener('mousedown', onDown)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      document.removeEventListener('mousedown', onDown)
    }
    // `choose` reads the editor at call time; `active` is what changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, active])

  // A section that goes away (reset, another page) takes the menu with it.
  useEffect(() => {
    if (!editor) setOpen(false)
  }, [editor])

  const optionId = (i: number) => `${id}-opt-${i}`

  return (
    <div className="shrink-0 sm:relative">
      <button
        ref={triggerRef}
        type="button"
        role="combobox"
        aria-label="Text style"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={`${id}-list`}
        aria-activedescendant={open ? optionId(active) : undefined}
        aria-disabled={!editor}
        // The section keeps its cursor and selection when the menu is clicked,
        // as the toolbar's buttons do.
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => (open ? setOpen(false) : openMenu())}
        onKeyDown={(e) => {
          if (open) return
          if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) {
            e.preventDefault()
            openMenu()
          }
        }}
        className={`flex h-9 w-[9.375rem] items-center justify-between gap-2 rounded-md border px-2.5 text-[0.8125rem] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/60 ${
          !editor
            ? 'cursor-default border-fw-border-soft text-fw-faint'
            : open
              ? 'border-brand bg-brand-soft text-fw-strong'
              : 'border-fw-border text-fw-text hover:border-fw-faint'
        }`}
      >
        <span className="truncate">{label}</span>
        <ChevronDown className={`shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <ul
          ref={listRef}
          id={`${id}-list`}
          role="listbox"
          aria-label="Text style"
          className="fw-card-shadow absolute inset-x-3 top-full z-40 mt-1.5 sm:inset-x-auto sm:left-0 sm:w-[18.75rem] rounded-xl border border-fw-border bg-fw-surface p-1.5"
        >
          {STYLES.map((s, i) => {
            const selected = s.level === level
            const enabled = can(s)
            return (
              <li
                key={s.level}
                id={optionId(i)}
                role="option"
                aria-selected={selected}
                aria-disabled={!enabled}
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setActive(i)}
                onClick={() => choose(s)}
                className={`flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 ${
                  i === active ? 'bg-fw-surface-2' : ''
                } ${enabled ? 'text-fw-strong' : 'cursor-default text-fw-faint'}`}
              >
                <span className="flex w-4 shrink-0 justify-center text-brand-hover">
                  {selected && <CheckIcon width={13} height={13} />}
                </span>
                <span className={`min-w-0 flex-1 truncate ${s.look}`}>{s.label}</span>
                <span className="flex shrink-0 flex-col items-end gap-0.5">
                  {s.markdown && (
                    <code className="rounded bg-fw-surface-2 px-1 font-mono text-[0.6563rem] text-fw-muted">
                      {s.markdown}
                    </code>
                  )}
                  <span className="text-[0.6563rem] text-fw-faint">{shortcut(s.keys)}</span>
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
