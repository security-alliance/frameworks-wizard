import { useEffect, useId, useRef, useState } from 'react'
import { aiPrompt } from '../../lib/aiPrompt.js'
import { headingLimit } from '../../lib/tiptapConfig.js'
import { CheckIcon } from '../ui.js'
import Tooltip from './Tooltip.js'
import { CopyIcon } from './toolbarIcons.js'
import type { Editor } from '@tiptap/react'

// "Copy instructions for AI": our formatting and style rules, copied on the
// first click, for whatever AI tool the contributor uses on their own draft.
//
// It's a utility, not a "write with AI" feature. The contributing guide allows
// grammar and phrasing help but not fully AI-written pages, so nothing here
// suggests the AI writes the content: the instructions themselves ask it to
// tidy the contributor's text, not to add to it (see aiPrompt.ts). The note
// that opens after copying says what to do with them, and stays until it's
// dismissed (Esc, or a click anywhere else).

export default function CopyInstructions({ editor }: { editor: Editor | null }) {
  const [copied, setCopied] = useState(false)
  const [note, setNote] = useState<null | { failed: boolean; text: string }>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const id = useId()

  async function copy() {
    const text = aiPrompt(editor && !editor.isDestroyed ? headingLimit(editor).above : null)
    try {
      await navigator.clipboard.writeText(text)
      setNote({ failed: false, text })
      setCopied(true)
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => setCopied(false), 2000)
    } catch {
      // No clipboard (permission refused, or not a secure context): the
      // instructions are shown to copy by hand instead.
      setNote({ failed: true, text })
    }
  }

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current)
  }, [])

  useEffect(() => {
    if (!note) return
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setNote(null)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      setNote(null)
    }
    document.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey, true)
    }
  }, [note])

  return (
    <div ref={rootRef} className="sm:relative">
      <Tooltip
        name="Copy instructions for AI"
        hint="Our formatting and style rules, for any AI tool you use on your own draft"
        off={!!note}
      >
        {(tip) => (
          <button
            {...tip}
            type="button"
            onClick={copy}
            aria-expanded={!!note}
            aria-controls={`${id}-note`}
            className={`flex h-9 items-center gap-1.5 rounded-md border px-2.5 text-[0.7813rem] font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/60 ${
              note
                ? 'border-brand bg-brand-soft text-fw-strong'
                : 'border-fw-border text-fw-text hover:bg-fw-surface-2'
            }`}
          >
            {copied ? <CheckIcon width={14} height={14} /> : <CopyIcon />}
            {copied ? (
              'Copied'
            ) : (
              <>
                <span className="sm:hidden">Copy for AI</span>
                <span className="hidden sm:inline">Copy instructions for AI</span>
              </>
            )}
          </button>
        )}
      </Tooltip>

      {note && (
        <div
          id={`${id}-note`}
          role="status"
          className="fw-card-shadow absolute inset-x-3 top-full z-40 mt-1.5 sm:inset-x-auto sm:right-0 sm:w-[21.25rem] rounded-xl border border-fw-border bg-fw-surface p-4 text-[0.7813rem] leading-relaxed text-fw-text"
        >
          {note.failed ? (
            <FailedNote text={note.text} />
          ) : (
            <>
              <p className="font-semibold text-fw-strong">Instructions copied</p>
              <p className="mt-1">
                Paste them into your AI tool along with what you wrote. They
                cover our formatting and style, so the text comes back ready to
                paste here.
              </p>
            </>
          )}
        </div>
      )}
    </div>
  )
}

function FailedNote({ text }: { text: string }) {
  const ref = useRef<HTMLTextAreaElement>(null)
  // Selected and ready for ⌘C / Ctrl+C.
  useEffect(() => {
    ref.current?.focus()
    ref.current?.select()
  }, [])
  return (
    <>
      <p className="font-semibold text-fw-strong">
        Couldn&apos;t copy. Select the text below and copy it yourself.
      </p>
      <textarea
        ref={ref}
        readOnly
        value={text}
        aria-label="Instructions for AI"
        onFocus={(e) => e.currentTarget.select()}
        className="mt-2 h-36 w-full resize-none rounded-lg border border-fw-border bg-fw-surface-2 p-2 font-mono text-[0.6875rem] text-fw-text focus:border-brand focus:outline-none"
      />
    </>
  )
}
