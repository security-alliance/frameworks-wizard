import { useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import type { Editor } from '@tiptap/react'

// Adding and removing table rows and columns, from the table itself.
//
// The editor could always do it, but nothing on screen said so: Tab in the last
// cell adds a row, which nobody guesses. So hovering a table shows the controls
// where the change will happen:
//
//   - a bar under the table adds a row at the end, and one along its right
//     edge adds a column;
//   - a handle at the start of the row under the pointer, and one above its
//     column, open a short menu: add above/below (left/right), or remove it,
//     for the rows and columns in between.
//
// The header row can't be removed or have a row put above it: a markdown table
// starts with exactly one header row, and without it the section could only
// be saved as HTML, which would lock it on the next visit. New rows below the
// header get ordinary cells and new columns get a header cell at the top;
// prosemirror-tables does both.

type Hover = { table: HTMLTableElement; cell: HTMLTableCellElement }
type Menu = 'row' | 'col' | null

export default function TableControls({
  editor,
  root,
}: {
  editor: Editor
  /** The section's box, which the controls are positioned in. */
  root: RefObject<HTMLDivElement | null>
}) {
  const [hover, setHover] = useState<Hover | null>(null)
  const [menu, setMenu] = useState<Menu>(null)
  const [, redraw] = useState(0)
  const hide = useRef<number | undefined>(undefined)
  const menuRef = useRef<HTMLDivElement>(null)
  const menuOpen = useRef(false)
  menuOpen.current = menu !== null

  useEffect(() => {
    const el = root.current
    if (!el) return
    // A short grace period, so the pointer can cross the gap between a cell
    // and a handle outside the table without the handle vanishing.
    const later = () => {
      window.clearTimeout(hide.current)
      hide.current = window.setTimeout(() => {
        if (menuOpen.current) return
        setHover(null)
      }, 300)
    }
    const onMove = (e: MouseEvent) => {
      const target = e.target as Element
      if (target.closest?.('[data-table-control]')) return void window.clearTimeout(hide.current)
      const cell = target.closest?.('td, th') as HTMLTableCellElement | null
      const table = cell?.closest('table') as HTMLTableElement | null
      if (!cell || !table || !editor.isEditable || !el.contains(table)) return later()
      window.clearTimeout(hide.current)
      // While a menu is open it stays with the row or column it was opened on.
      if (!menuOpen.current) setHover({ table, cell })
    }
    const onLeave = () => {
      if (menuOpen.current) return
      later()
    }
    const onEnter = () => window.clearTimeout(hide.current)
    el.addEventListener('mousemove', onMove)
    el.addEventListener('mouseleave', onLeave)
    el.addEventListener('mouseenter', onEnter)
    return () => {
      el.removeEventListener('mousemove', onMove)
      el.removeEventListener('mouseleave', onLeave)
      el.removeEventListener('mouseenter', onEnter)
      window.clearTimeout(hide.current)
    }
  }, [editor, root])

  // Rows and columns change the table's size, and ProseMirror may redraw the
  // cells: the controls follow, or go if their cell has gone.
  useEffect(() => {
    const onChange = () => {
      setHover((h) => (h && h.cell.isConnected ? h : null))
      redraw((n) => n + 1)
    }
    editor.on('transaction', onChange)
    return () => {
      editor.off('transaction', onChange)
    }
  }, [editor])

  // A click anywhere else closes the menu.
  useEffect(() => {
    if (!menu) return
    const onDown = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenu(null)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [menu])

  const box = root.current?.getBoundingClientRect()
  if (!hover || !box || !hover.cell.isConnected) return null
  const { table, cell } = hover
  const t = table.getBoundingClientRect()
  const c = cell.getBoundingClientRect()
  const row = cell.parentElement as HTMLTableRowElement
  const isHeader = row.rowIndex === 0 && cell.tagName === 'TH'
  const columns = row.cells.length

  // Commands act on the selection, so the cursor goes into the cell first.
  // The view is focused directly rather than with the chain's `focus()`,
  // which waits a frame: the section only records edits made while it has
  // focus (see `onUpdate` in ProseBlock), and a row added before then would go
  // unsaved until the next keystroke.
  const run = (target: HTMLTableCellElement, command: (c: ReturnType<Editor['chain']>) => ReturnType<Editor['chain']>) => {
    const inner = target.querySelector('p') ?? target
    const pos = editor.view.posAtDOM(inner, 0)
    editor.view.focus()
    command(editor.chain().setTextSelection(pos)).run()
    setMenu(null)
  }
  const lastRow = table.rows[table.rows.length - 1]
  const headerRow = table.rows[0]

  const at = (left: number, top: number) => ({ left: left - box.left, top: top - box.top })
  const handle =
    'absolute z-10 flex h-5 w-5 items-center justify-center rounded border border-fw-border bg-fw-surface text-fw-muted shadow-sm hover:border-brand hover:text-fw-strong'
  const bar =
    'absolute z-10 flex items-center justify-center rounded border border-dashed border-fw-border bg-fw-surface/80 text-[0.6875rem] font-medium text-fw-faint opacity-60 transition-opacity hover:border-brand hover:text-fw-strong hover:opacity-100'
  const keep = (e: { preventDefault: () => void }) => e.preventDefault() // don't take the cursor out of the text

  return (
    <>
      <button
        type="button"
        aria-label="Row options"
        title="Row options"
        data-table-control
        onMouseDown={keep}
        onClick={() => setMenu((m) => (m === 'row' ? null : 'row'))}
        className={handle}
        style={at(t.left - 24, c.top + c.height / 2 - 10)}
      >
        <Dots vertical />
      </button>
      <button
        type="button"
        aria-label="Column options"
        title="Column options"
        data-table-control
        onMouseDown={keep}
        onClick={() => setMenu((m) => (m === 'col' ? null : 'col'))}
        className={handle}
        style={at(c.left + c.width / 2 - 10, t.top - 24)}
      >
        <Dots />
      </button>

      <button
        type="button"
        data-table-control
        onMouseDown={keep}
        onClick={() => run(lastRow.cells[0], (x) => x.addRowAfter())}
        className={bar}
        style={{ ...at(t.left, t.bottom + 4), width: t.width, height: 20 }}
      >
        + Add row
      </button>
      <button
        type="button"
        aria-label="Add column"
        title="Add column"
        data-table-control
        onMouseDown={keep}
        onClick={() => run(headerRow.cells[headerRow.cells.length - 1], (x) => x.addColumnAfter())}
        className={bar}
        style={{ ...at(t.right + 4, t.top), width: 20, height: t.height }}
      >
        +
      </button>

      {menu && (
        <div
          ref={menuRef}
          data-table-control
          role="menu"
          className="fw-card-shadow absolute z-20 w-44 rounded-lg border border-fw-border bg-fw-surface py-1 text-xs"
          style={menu === 'row' ? at(t.left - 24, c.top + c.height / 2 + 14) : at(c.left + c.width / 2 - 10, t.top - 2)}
        >
          {menu === 'row' ? (
            <>
              <Item disabled={isHeader} onClick={() => run(cell, (x) => x.addRowBefore())}>
                Add row above
              </Item>
              <Item onClick={() => run(cell, (x) => x.addRowAfter())}>Add row below</Item>
              <Item danger disabled={isHeader} onClick={() => run(cell, (x) => x.deleteRow())}>
                Remove row
              </Item>
              {isHeader && <Note>The header row stays: every table needs one.</Note>}
            </>
          ) : (
            <>
              <Item onClick={() => run(cell, (x) => x.addColumnBefore())}>Add column left</Item>
              <Item onClick={() => run(cell, (x) => x.addColumnAfter())}>Add column right</Item>
              <Item danger disabled={columns < 2} onClick={() => run(cell, (x) => x.deleteColumn())}>
                Remove column
              </Item>
            </>
          )}
        </div>
      )}
    </>
  )
}

function Item({
  children,
  onClick,
  disabled,
  danger,
}: {
  children: string
  onClick: () => void
  disabled?: boolean
  danger?: boolean
}) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={`block w-full px-3 py-1.5 text-left hover:bg-fw-surface-2 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent ${
        danger ? 'text-del' : 'text-fw-text'
      }`}
    >
      {children}
    </button>
  )
}

const Note = ({ children }: { children: string }) => (
  <p className="border-t border-fw-border-soft px-3 pb-1 pt-1.5 text-[0.6875rem] leading-snug text-fw-faint">
    {children}
  </p>
)

function Dots({ vertical }: { vertical?: boolean }) {
  const pts = [-4, 0, 4]
  return (
    <svg width="12" height="12" viewBox="-6 -6 12 12" aria-hidden>
      {pts.map((p) => (
        <circle key={p} cx={vertical ? 0 : p} cy={vertical ? p : 0} r="1.3" fill="currentColor" />
      ))}
    </svg>
  )
}
