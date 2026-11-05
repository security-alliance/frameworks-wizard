import { Extension, mergeAttributes } from '@tiptap/react'
import type { Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { Table, TableRow, TableHeader, TableCell } from '@tiptap/extension-table'
import { Image } from '@tiptap/extension-image'
import { Link } from '@tiptap/extension-link'
import { Code } from '@tiptap/extension-code'
import { Paragraph } from '@tiptap/extension-paragraph'
import { TaskList, TaskItem } from '@tiptap/extension-list'
import { Markdown } from 'tiptap-markdown'

// Inline code that can also be bold or a link: "**`version`**", or
// "[`supply-chain/overview.mdx`](/supply-chain/overview)". TipTap's code
// excludes every other formatting, so the bold or the link was dropped and the
// safety check locked 40 sections over it.
const CombinableCode = Code.extend({ excludes: '' })

// The converter remembers where a bold or italic run starts so it can tidy the
// spaces around it, and it took that position before writing the `>` line that
// separates two paragraphs of a quote. A quote paragraph starting with bold
// ("> **Administrator** should…") then lost its `>` line and gained a `****`.
// Writing the pending separator first, as any text would, puts the position
// where the run really starts. Otherwise the same rule as the converter's.
const QuoteSafeParagraph = Paragraph.extend({
  addStorage() {
    return {
      markdown: {
        serialize(state: MdState & { renderInline(n: unknown): void; closeBlock(n: unknown): void }, node: unknown) {
          state.write('')
          state.renderInline(node)
          state.closeBlock(node)
        },
        parse: {},
      },
    }
  },
})

// The bits of the markdown writer the specs below use.
interface MdState {
  write(s: string): void
  repeat(s: string, n: number): string
  renderContent(node: unknown): void
  renderList(node: unknown, delim: string, first: (i: number) => string): void
}
interface MdNode {
  attrs: Record<string, unknown>
  childCount: number
}

// Checklist items, three kinds: unticked, ticked, and no box at all. The last is
// a plain bullet inside a checklist, which the docs use for group headings
// ("- Code security >" over its boxed sub-items) and for notes between items.
// The editor's own task list only has the first two, so it either gave those
// bullets a box nobody wrote or dropped them, and the safety check locked 21
// checklists. `plain` is the third kind, written back as a plain `- `. (Its own
// attribute, since TipTap reads a `null` from parsing as "use the default".)
//
// The boxes are shown but never tickable: they're for readers of the live page,
// and a tick saved here would publish the item as already done for everyone.
// `disabled` also keeps them out of the Tab order, so the keyboard can't either.
const ChecklistItem = TaskItem.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      // Enter after a plain bullet makes an ordinary item, with a box.
      plain: {
        default: false,
        keepOnSplit: false,
        parseHTML: (el: HTMLElement) => el.getAttribute('data-checked') === 'none',
        renderHTML: (attrs: { plain?: boolean }) => (attrs.plain ? { 'data-plain': '' } : {}),
      },
    }
  },
  addStorage() {
    return {
      markdown: {
        serialize(state: MdState, node: MdNode) {
          if (!node.attrs.plain) state.write(node.attrs.checked ? '[x] ' : '[ ] ')
          state.renderContent(node)
        },
        parse: {
          // The markdown parser marks a list holding any `[ ]` item as a task
          // list. Every item in it becomes a checklist item here, the plain ones
          // as "no box", so none is dropped.
          updateDOM(element: HTMLElement) {
            element.querySelectorAll('.contains-task-list').forEach((list) => {
              for (const li of Array.from(list.children)) {
                if (li.tagName !== 'LI') continue
                li.setAttribute('data-type', 'taskItem')
                const box = li.classList.contains('task-list-item')
                  ? li.querySelector('input[type="checkbox"]')
                  : null
                li.setAttribute('data-checked', box ? String((box as HTMLInputElement).checked) : 'none')
                box?.remove()
              }
            })
          },
        },
      },
    }
  },
  addNodeView() {
    const render = this.parent?.()
    if (!render) return null
    return (props) => {
      const view = render(props)
      const dom = view.dom as HTMLElement
      dom.querySelector('input[type="checkbox"]')?.setAttribute('disabled', '')
      const mark = (node: { attrs: Record<string, unknown> }) =>
        dom.toggleAttribute('data-plain', !!node.attrs.plain)
      mark(props.node)
      const update = view.update?.bind(view)
      if (update) {
        view.update = (...args: Parameters<typeof update>) => {
          const ok = update(...args)
          if (ok) mark(args[0])
          return ok
        }
      }
      return view
    }
  },
})

// A line break inside a paragraph (the docs hard-wrap at ~120 columns) means a
// space, but the converter hands it over as a bare newline, and inside list
// items that newline was dropped: "**must**⏎be backed" came back as
// "**must**be backed". The safety check caught it and locked the section, so
// nothing was corrupted, but it locked lists for nothing. With `breaks` off a
// soft break renders as a space anyway; this just says so before parsing.
const SoftBreakAsSpace = Extension.create({
  name: 'softBreakAsSpace',
  addStorage() {
    return {
      markdown: {
        parse: {
          setup(md: { renderer: { rules: Record<string, () => string> } }) {
            md.renderer.rules.softbreak = () => ' '
          },
        },
      },
    }
  },
})

// Empty list items, the blanks of a template ("1." "2." "3." under Contributing
// Factors), are dropped when the editor builds its document, since an item
// needs a paragraph to exist. Each gets an empty one, so they survive.
const KeepEmptyListItems = Extension.create({
  name: 'keepEmptyListItems',
  addStorage() {
    return {
      markdown: {
        parse: {
          updateDOM(element: HTMLElement) {
            element.querySelectorAll('li').forEach((li) => {
              if (li.children.length === 0 && (li.textContent ?? '').trim() === '') {
                // The converter decides a list is tight by it having no
                // paragraphs, which the one added here would break.
                const list = li.parentElement
                if (list && !list.querySelector('p')) list.setAttribute('data-tight', 'true')
                li.textContent = ''
                li.appendChild(li.ownerDocument.createElement('p'))
              }
            })
          },
        },
      },
    }
  },
})

// The converter keeps bulleted and numbered lists tight (no blank line between
// items, the way the docs write them) through a `tight` attribute it only gives
// those two list types. Without the same attribute, every checklist came back
// with blank lines between its items: a different list to markdown, so the
// safety check locked 259 of the 270 checklists. Same rule as the converter's.
const TightTaskList = TaskList.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      tight: {
        default: true,
        parseHTML: (el: HTMLElement) =>
          el.getAttribute('data-tight') === 'true' || !el.querySelector('p'),
        renderHTML: (attrs: { tight?: boolean }) => ({
          'data-tight': attrs.tight ? 'true' : null,
        }),
      },
    }
  },
})

// `1. [ ]` checklists: steps that have an order, as in the incident runbooks.
// The editor's task list is bulleted only, so these came back broken. This is
// the same list, numbered, and written back with its numbers the way markdown
// numbers any list.
const NumberedTaskList = TightTaskList.extend({
  name: 'numberedTaskList',
  addAttributes() {
    return {
      ...this.parent?.(),
      start: {
        default: 1,
        parseHTML: (el: HTMLElement) => Number(el.getAttribute('start') ?? 1) || 1,
        renderHTML: (attrs: { start?: number }) => (attrs.start !== 1 ? { start: attrs.start } : {}),
      },
    }
  },
  parseHTML() {
    return [{ tag: 'ol[data-type="taskList"]', priority: 51 }]
  },
  renderHTML({ HTMLAttributes }) {
    return ['ol', mergeAttributes(HTMLAttributes, { 'data-type': 'taskList' }), 0]
  },
  // The bulleted list's commands and shortcuts stay with it, not twice.
  addCommands() {
    return {}
  },
  addKeyboardShortcuts() {
    return {}
  },
  addInputRules() {
    return []
  },
  addStorage() {
    return {
      markdown: {
        serialize(state: MdState, node: MdNode) {
          const start = Number(node.attrs.start) || 1
          const width = String(start + node.childCount - 1).length
          state.renderList(node, state.repeat(' ', width + 2), (i) => {
            const n = String(start + i)
            return state.repeat(' ', width - n.length) + n + '. '
          })
        },
        parse: {},
      },
    }
  },
})

// Links always written as `[text](url)`. The markdown writer turns a link whose
// text is its own address into `<https://…>`, which plain markdown reads as a
// link but MDX reads as the start of a tag, so the page would stop building.
// The safety check caught it and locked those sections; this writes the form
// MDX can read, which is how the docs write them.
const MdxLink = Link.extend({
  addStorage() {
    return {
      markdown: {
        serialize: {
          open: () => '[',
          close: (_state: unknown, mark: { attrs: { href: string; title?: string | null } }) => {
            const href = mark.attrs.href.replace(/[()"]/g, '\\$&')
            const title = mark.attrs.title ? ` "${mark.attrs.title.replace(/"/g, '\\"')}"` : ''
            return `](${href}${title})`
          },
          mixable: true,
        },
        parse: {},
      },
    }
  },
})

// A column's alignment (`:---` left, `---:` right, `:---:` centred). The
// markdown parser puts it on each cell as `text-align`, the editor's table had
// nowhere to keep it, and the table writer always wrote `---`, so aligned
// tables lost their alignment. Kept per cell here, and written back into the
// divider row by `editorMarkdown` below.
const align = {
  align: {
    default: null,
    parseHTML: (el: HTMLElement) => el.style.textAlign || el.getAttribute('align') || null,
    renderHTML: (attrs: { align?: string | null }) =>
      attrs.align ? { style: `text-align: ${attrs.align}` } : {},
  },
}
const AlignedTableHeader = TableHeader.extend({
  addAttributes() {
    return { ...this.parent?.(), ...align }
  },
})
const AlignedTableCell = TableCell.extend({
  addAttributes() {
    return { ...this.parent?.(), ...align }
  },
})

// One shared extension set for every prose block, so what round-trips in the
// fidelity check is exactly what runs in the browser.
//
// `bulletListMarker: '-'` matches the repo's dominant style, and `linkify` and
// `breaks` stay off so the serializer never invents markup the author didn't
// write.
export const proseExtensions = [
  StarterKit.configure({
    heading: { levels: [1, 2, 3, 4, 5, 6] },
    // Replaced by MdxLink below, so links are written the way MDX reads them.
    link: false,
    // Replaced by CombinableCode below.
    code: false,
    // Replaced by QuoteSafeParagraph below.
    paragraph: false,
    // Off: on the first click into a section that ends in a list (every
    // checklist does), it appended an empty paragraph, and the gap stayed after
    // leaving. It's there so you can type below a final list; Enter twice at
    // the end of the list does that too, the way lists work everywhere.
    trailingNode: false,
  }),
  // Docs link to each other with root-relative paths. Following one from
  // inside the editor would navigate the wizard away and lose the edit, so
  // links are inert while editing — the Review step is where they work.
  MdxLink.configure({ openOnClick: false, autolink: false }),
  CombinableCode,
  QuoteSafeParagraph,
  Table.configure({ resizable: false }),
  TableRow,
  AlignedTableHeader,
  AlignedTableCell,
  // Inline, so an image inside a sentence ("Enter Safe address and load
  // ![screenshot](…)") is kept. As a block-only node it was dropped.
  Image.configure({ inline: true }),
  // `- [ ]` lists, from inside <Checklist>. Nested so an item can carry sub-items
  // and notes, which a third of the docs' checklists do.
  TightTaskList,
  NumberedTaskList,
  ChecklistItem.configure({ nested: true }),
  SoftBreakAsSpace,
  KeepEmptyListItems,
  Markdown.configure({
    html: true,
    tightLists: true,
    bulletListMarker: '-',
    linkify: false,
    breaks: false,
  }),
]

// A document node, as far as `editorMarkdown` reads one.
interface DocNode {
  type: { name: string }
  attrs: Record<string, unknown>
  childCount: number
  child(i: number): DocNode
  descendants(f: (node: DocNode) => boolean | void): void
}

// The converter writes a table as markdown only when it can: a header row and
// no merged or multi-paragraph cells. Others go out as HTML, with no divider
// row. Same test as the converter's, so tables and divider rows pair up.
const asMarkdownTable = (table: DocNode): boolean => {
  const cells = (row: DocNode) => Array.from({ length: row.childCount }, (_, i) => row.child(i))
  const merged = (c: DocNode) => Number(c.attrs.colspan ?? 1) > 1 || Number(c.attrs.rowspan ?? 1) > 1
  const rows = Array.from({ length: table.childCount }, (_, i) => table.child(i))
  return (
    rows.length > 0 &&
    cells(rows[0]).every((c) => c.type.name === 'tableHeader' && !merged(c) && c.childCount <= 1) &&
    rows.slice(1).every((r) => cells(r).every((c) => c.type.name !== 'tableHeader' && !merged(c) && c.childCount <= 1))
  )
}

const DIVIDER_ROW_RE = /^([ \t>]*)\| ---(?: \| ---)* \|$/gm

/**
 * The editor's content as markdown, with each table's column alignment in its
 * divider row (`| :--- | ---: |`). The converter always writes `---`; the
 * alignment is on the header cells (see `align` above), read here in document
 * order, which is the order the tables are written in.
 */
export function editorMarkdown(editor: Editor): string {
  const md = (editor.storage as unknown as { markdown: { getMarkdown(): string } }).markdown.getMarkdown()
  const aligns: (string | null)[][] = []
  ;(editor.state.doc as unknown as DocNode).descendants((node) => {
    if (node.type.name !== 'table') return true
    if (asMarkdownTable(node)) {
      const head = node.child(0)
      aligns.push(Array.from({ length: head.childCount }, (_, i) => (head.child(i).attrs.align as string | null) ?? null))
    }
    return false
  })
  let t = 0
  return md.replace(DIVIDER_ROW_RE, (row, lead: string) => {
    const a = aligns[t++]
    if (!a || a.every((x) => !x)) return row
    const cell = (x: string | null) => (x === 'left' ? ':---' : x === 'right' ? '---:' : x === 'center' ? ':---:' : '---')
    return `${lead}| ${a.map(cell).join(' | ')} |`
  })
}
