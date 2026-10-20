import { useEffect, useRef, useState } from 'react'
import { Button } from '../ui.js'
import type { Editor } from '@tiptap/react'

// Adding a link, without a browser dialog.
//
//
// The panel below makes the answers visible: what the link
// currently is, what it will point at, and a Remove button that says so.

/**
 * Tidy up what someone typed, or refuse it.
 *
 * Pasting `example.com` should not produce a link relative to the current page,
 * so a bare host gets `https://`. But the docs link to each other with
 * root-relative paths and in-page anchors, and those must be left exactly as
 * they are — see the `link` note in tiptapConfig.
 *
 * Anything naming a scheme that isn't http, https or mailto is refused rather
 * than repaired. `javascript:` and `data:` are the reason: this text ends up
 * rendered on a public site, and a link is the cheapest place to hide one.
 */
export function normaliseUrl(raw: string): string | null {
  const v = raw.trim()
  if (!v) return null
  if (v.startsWith('/') || v.startsWith('#')) return v
  if (/^(https?:|mailto:)/i.test(v)) return v
  if (/^[a-z][a-z0-9+.-]*:/i.test(v)) return null
  return `https://${v}`
}

export default function LinkPopover({
  editor,
  onClose,
}: {
  editor: Editor
  onClose: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // What's already there, read once when the panel opens.
  const existing = (editor.getAttributes('link').href as string | undefined) ?? ''
  // With nothing selected there is no text to attach a link to, so the panel
  // asks for the words as well and inserts them.
  const { from, to } = editor.state.selection
  const needsText = from === to && !existing

  const [href, setHref] = useState(existing)
  const [text, setText] = useState('')
  const [invalid, setInvalid] = useState(false)

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (ref.current?.contains(target)) return
      // The button that opens this panel counts as inside it. Otherwise
      // mousedown closes the panel and the click that follows reopens it, and
      // the control that should dismiss the panel is the one thing that can't.
      if (target.closest?.('[data-link-control]')) return
      onClose()
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [onClose])

  function apply() {
    const url = normaliseUrl(href)
    if (!url) {
      setInvalid(true)
      inputRef.current?.focus()
      return
    }

    if (needsText) {
      const label = text.trim() || url
      editor
        .chain()
        .focus()
        .insertContent({
          type: 'text',
          text: label,
          marks: [{ type: 'link', attrs: { href: url } }],
        })
        .run()
    } else {
      // `extendMarkRange` is what makes putting the cursor in the middle of an
      // existing link and editing it work, rather than linking the single
      // character under the caret.
      editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run()
    }
    onClose()
  }

  function remove() {
    editor.chain().focus().extendMarkRange('link').unsetLink().run()
    onClose()
  }

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label="Link"
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation()
          onClose()
          editor.chain().focus().run()
        }
        if (e.key === 'Enter') {
          e.preventDefault()
          apply()
        }
      }}
      className="fw-card-shadow absolute left-0 top-full z-30 mt-1.5 w-80 max-w-[calc(100vw-2rem)] rounded-xl border border-fw-border bg-fw-surface p-3"
    >
      {needsText && (
        <label className="mb-2.5 block">
          <span className="text-[11px] font-semibold text-fw-muted">
            Text to show
          </span>
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="OWASP cheat sheet"
            className="mt-1 w-full rounded-lg border border-fw-border bg-fw-surface-2 px-2.5 py-1.5 text-[13px] text-fw-text placeholder:text-fw-faint focus:border-brand focus:outline-none"
          />
        </label>
      )}

      <label className="block">
        <span className="text-[11px] font-semibold text-fw-muted">
          {existing ? 'Link address' : 'Links to'}
        </span>
        <input
          ref={inputRef}
          value={href}
          onChange={(e) => {
            setHref(e.target.value)
            setInvalid(false)
          }}
          placeholder="example.com/page"
          inputMode="url"
          aria-invalid={invalid}
          className={`mt-1 w-full rounded-lg border bg-fw-surface-2 px-2.5 py-1.5 text-[13px] text-fw-text placeholder:text-fw-faint focus:outline-none ${
            invalid
              ? 'border-red-500/70 focus:border-red-500'
              : 'border-fw-border focus:border-brand'
          }`}
        />
      </label>

      {invalid ? (
        <p className="mt-1.5 text-[11.5px] leading-relaxed text-red-400">
          That doesn&apos;t look like a web address. Use something like
          example.com, or /ai-security/overview for another page on this site.
        </p>
      ) : (
        <p className="mt-1.5 text-[11.5px] leading-relaxed text-fw-faint">
          A full address, or a path like /ai-security/overview to link somewhere
          else on this site.
        </p>
      )}

      <div className="mt-3 flex items-center gap-2">
        <Button onClick={apply} className="px-3 py-1.5 text-xs">
          {existing ? 'Update' : 'Add link'}
        </Button>
        {existing && (
          <button
            onClick={remove}
            className="rounded-md px-2 py-1.5 text-xs font-medium text-fw-muted hover:bg-fw-surface-2 hover:text-fw-text"
          >
            Remove
          </button>
        )}
        <button
          onClick={() => {
            onClose()
            editor.chain().focus().run()
          }}
          className="ml-auto rounded-md px-2 py-1.5 text-xs font-medium text-fw-muted hover:bg-fw-surface-2 hover:text-fw-text"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
