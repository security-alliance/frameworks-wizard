import { useState } from 'react'
import { managedLabel, rawLabel } from '../../lib/blocks.js'
import type { Block } from '../../lib/types.js'
import { LockSmallIcon } from '../ui.js'

// Boilerplate and structured content the contributor shouldn't retype.
//
// `managed` blocks (imports, tag list, credits, footer) are generated from the
// page's settings, and showing them as text would be the most confusing thing
// in the editor. `raw` blocks are real content in a form the visual editor
// can't safely rewrite, so they're preserved byte-for-byte and viewable.
//
// Both are deliberately quiet: a slim inline pill rather than a card, because
// they sit between the sections people came here to edit and shouldn't compete
// with them for attention.
export default function LockedBlock({ block }: { block: Block }) {
  const [open, setOpen] = useState(false)
  const managed = block.kind === 'managed'
  const label = managed ? managedLabel(block) : rawLabel(block)

  return (
    <div>
      <button
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1.5 rounded-md bg-fw-surface-2/60 px-2 py-1 text-[11px] text-fw-faint transition-colors hover:bg-fw-surface-2 hover:text-fw-muted"
      >
        <LockSmallIcon width="11" height="11" />
        <span className="font-medium">{label}</span>
        <span>{managed ? '· added automatically' : '· kept as it is'}</span>
        <span className="text-fw-muted">{open ? '· hide' : '· show'}</span>
      </button>
      {open && (
        <pre className="mt-1.5 overflow-x-auto whitespace-pre-wrap wrap-break-word rounded-md border border-fw-border bg-fw-bg p-3 text-[12px] leading-relaxed text-fw-muted">
          {block.text}
        </pre>
      )}
    </div>
  )
}
