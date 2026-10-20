import { useMemo } from 'react'
import { parseChecklist, serializeChecklist } from '../../lib/blocks.js'
import type { Block, ChecklistItem } from '../../lib/types.js'
import { PlusIcon, TrashIcon } from '../ui.js'

// A <Checklist> rendered as actual checkboxes. Contributors never see the
// wrapper tag or the `- [ ]` syntax, so there's nothing to hand-write.
export default function ChecklistBlock({
  block,
  onChange,
}: {
  block: Block
  onChange: (id: string, text: string) => void
}) {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const parsed = useMemo(() => parseChecklist(block), [block.text])

  function commit(items: ChecklistItem[]) {
    onChange(block.id, serializeChecklist({ ...parsed, items }))
  }

  const set = (i: number, patch: Partial<ChecklistItem>) =>
    commit(parsed.items.map((it, n) => (n === i ? { ...it, ...patch } : it)))

  return (
    <div className="rounded-xl border border-fw-border-soft bg-fw-surface-2/30 px-4 py-3">
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-fw-faint">
        Checklist
      </div>

      <ul className="space-y-1">
        {parsed.items.map((item, i) => (
          <li key={i} className="group flex items-center gap-2">
            <input
              type="checkbox"
              checked={item.checked}
              onChange={(e) => set(i, { checked: e.target.checked })}
              className="h-4 w-4 shrink-0 accent-brand"
            />
            <input
              value={item.text}
              onChange={(e) => set(i, { text: e.target.value })}
              className="min-w-0 flex-1 rounded border border-transparent bg-transparent px-1.5 py-1 text-sm text-fw-text hover:border-fw-border focus:border-brand focus:outline-none"
            />
            <button
              type="button"
              title="Remove item"
              onClick={() => commit(parsed.items.filter((_, n) => n !== i))}
              className="shrink-0 rounded p-1 text-fw-faint opacity-0 transition-opacity hover:bg-fw-surface-2 hover:text-fw-text group-hover:opacity-100"
            >
              <TrashIcon />
            </button>
          </li>
        ))}
      </ul>

      <button
        type="button"
        onClick={() => commit([...parsed.items, { checked: false, text: '' }])}
        className="mt-2 inline-flex items-center gap-1.5 rounded-md px-1.5 py-1 text-xs font-medium text-fw-muted hover:bg-fw-surface-2 hover:text-fw-text"
      >
        <PlusIcon width="14" height="14" /> Add item
      </button>
    </div>
  )
}
