import type { ReactNode } from 'react'
import { CloseIcon } from './toolbarIcons.js'

// Formatting help: a reference beside the page, not a popover over it. The
// popover covered half the page being edited and ran off the bottom of the
// screen. Shortcuts now also live in the controls (style menu, tooltips), so
// what's left is short. EditStep places it: outside the card on a wide screen,
// in the toolbar band on a narrow one. Not remembered between visits: it's
// reference, not a preference.

const SHORTCUTS: [string, string][] = [
  ['##', 'Heading'],
  ['###', 'Subheading'],
  ['####', 'Small heading'],
  ['-', 'Bulleted list'],
  ['1.', 'Numbered list'],
  ['[ ]', 'Checklist item'],
  ['>', 'Quote'],
  ['**bold**', 'Bold, or ⌘B'],
  ['*italic*', 'Italic, or ⌘I'],
  ['`code`', 'Setting names and commands'],
]

export default function HelpPanel({
  id,
  onClose,
  className = '',
}: {
  id: string
  onClose: () => void
  className?: string
}) {
  return (
    <aside
      id={id}
      aria-label="Formatting help"
      onKeyDown={(e) => {
        if (e.key !== 'Escape') return
        e.stopPropagation()
        onClose()
      }}
      className={`text-[0.7813rem] leading-relaxed text-fw-text ${className}`}
    >
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-fw-strong">Formatting help</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close formatting help"
          className="flex h-7 w-7 items-center justify-center rounded-md text-fw-muted hover:bg-fw-surface-2 hover:text-fw-text"
        >
          <CloseIcon />
        </button>
      </div>
      <p className="mt-2 text-fw-muted">
        The toolbar does everything. If you know markdown, type it at the start
        of a line and it turns into formatting.
      </p>

      <Section title="Shortcuts">
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
          {SHORTCUTS.map(([keys, does]) => (
            <div key={keys} className="contents">
              <dt>
                <code className="rounded bg-fw-surface-2 px-1 font-mono text-[0.6875rem]">{keys}</code>
              </dt>
              <dd>{does}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-2 text-fw-muted">
          Headings go down one level at a time: a small heading sits under a
          subheading, not straight under a heading.
        </p>
      </Section>

      <Section title="Pasting">
        <ul className="list-disc space-y-1 pl-4">
          <li>Markdown from an editor or an AI turns into formatting when you paste it.</li>
          <li>To paste it exactly as written, use ⌘⇧V (Ctrl+Shift+V on Windows).</li>
          <li>
            Don&apos;t type tags like{' '}
            <code className="rounded bg-fw-surface-2 px-1 font-mono text-[0.6875rem]">&lt;Checklist&gt;</code>.
            They show on the page as text. A checklist you add gets its box automatically.
          </li>
        </ul>
      </Section>
    </aside>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-4">
      <h3 className="mb-1.5 text-[0.7813rem] font-semibold text-fw-strong">{title}</h3>
      {children}
    </section>
  )
}
