import { titleize } from '../../lib/format.js'
import type { PageEntry } from '../../lib/types.js'

// The "Editing: Framework › Subfolder › Page" breadcrumb under the picker.
export default function EditingSummary({ current }: { current?: PageEntry | null }) {
  if (!current) return null
  return (
    <div className="border-t border-fw-border bg-fw-surface-2/40 px-6 py-3">
      <span className="text-xs font-medium text-fw-faint">Editing: </span>
      <span className="text-sm font-medium text-fw-strong">
        {titleize(current.framework)}
        {current.subdir.map((s) => (
          <span key={s}> › {titleize(s)}</span>
        ))}{' '}
        › <span className="text-brand-hover">{titleize(current.name)}</span>
      </span>
    </div>
  )
}
