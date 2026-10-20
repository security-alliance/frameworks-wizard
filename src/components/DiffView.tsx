import { useMemo } from 'react'
import { computeDiffRows } from '../lib/diff.js'
import type { DiffRow } from '../lib/diff.js'

// GitHub-style unified diff. Green = added, red = removed, with old/new
// line-number gutters and collapsed unchanged regions.
export default function DiffView({
  original,
  edited,
}: {
  original: string
  edited: string
}) {
  const { rows, changed, added, removed } = useMemo(
    () => computeDiffRows(original, edited),
    [original, edited],
  )

  if (!changed) {
    return (
      <div className="flex h-full items-center justify-center text-center text-sm text-fw-muted">
        <div>
          <div className="text-fw-text">No changes yet</div>
          <div className="mt-1 text-xs text-fw-faint">
            Edits you make in the Write step will show up here as a diff.
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full overflow-auto">
      <div className="flex items-center gap-3 border-b border-fw-border bg-fw-surface-2/40 px-4 py-2 text-xs">
        <span className="font-medium text-fw-muted">Changes</span>
        <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 font-mono text-emerald-400">
          +{added}
        </span>
        <span className="rounded bg-red-500/15 px-1.5 py-0.5 font-mono text-red-400">
          −{removed}
        </span>
      </div>
      <table className="w-full border-collapse font-mono text-[12.5px] leading-relaxed">
        <tbody>
          {rows.map((row, idx) => (
            <Row key={idx} row={row} />
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Row({ row }: { row: DiffRow }) {
  if (row.type === 'gap') {
    return (
      <tr className="select-none">
        <td colSpan={3} className="bg-fw-surface-2/30 px-4 py-1 text-center text-[11px] text-fw-faint">
          ⋯ {row.count} unchanged line{row.count === 1 ? '' : 's'}
        </td>
      </tr>
    )
  }

  const style = {
    add: { row: 'bg-emerald-500/10', sign: 'text-emerald-400', text: 'text-emerald-200' },
    del: { row: 'bg-red-500/10', sign: 'text-red-400', text: 'text-red-200' },
    ctx: { row: '', sign: 'text-fw-faint', text: 'text-fw-muted' },
  }[row.type]
  const sign = row.type === 'add' ? '+' : row.type === 'del' ? '−' : ' '

  return (
    <tr className={style.row}>
      <td className="w-10 select-none border-r border-fw-border-soft px-2 text-right text-[11px] text-fw-faint">
        {'oldLn' in row ? row.oldLn : ''}
      </td>
      <td className="w-10 select-none border-r border-fw-border-soft px-2 text-right text-[11px] text-fw-faint">
        {'newLn' in row ? row.newLn : ''}
      </td>
      <td className={`whitespace-pre-wrap wrap-break-word px-3 ${style.text}`}>
        <span className={`mr-2 select-none ${style.sign}`}>{sign}</span>
        {row.text || ' '}
      </td>
    </tr>
  )
}
