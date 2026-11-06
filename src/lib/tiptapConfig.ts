import { Extension, InputRule, mergeAttributes } from '@tiptap/react'
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
  ensureNewLine(): void
  flushClose(size?: number): void
  closeBlock(node: unknown): void
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
                // The space after the box goes with it. Opening a page drops it
                // anyway, but a paste keeps whitespace, and pasted items came
                // out as `- [ ]  text`, with two spaces.
                const after = box?.nextSibling
                box?.remove()
                if (after?.nodeType === 3) after.textContent = (after.textContent ?? '').replace(/^\s+/, '')
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

/* ------------------------------------------------------------------ *
 * where a section sits in its page
 * ------------------------------------------------------------------ */

/**
 * What a section's editor needs to know about the rest of the page, which it
 * can't see: each section is an editor of its own. ProseBlock keeps it current
 * and hands it over through `pageContext` storage.
 */
export interface PageContext {
  /** False inside a component that is already a checklist, like
   *  `<Checklist>`, where a new list needs no box of its own. */
  boxChecklists: boolean
  /** The last heading before this section on the page. */
  headingAbove: { level: number; text: string } | null
  /** The checklist ids the rest of the page already uses. */
  usedIds: string[]
}

interface PageContextStorage {
  get: (() => PageContext) | null
  /** The id each boxed checklist gets, worked out before each write. */
  ids: Map<unknown, string>
}

const PageContextExtension = Extension.create({
  name: 'pageContext',
  addStorage(): PageContextStorage {
    return { get: null, ids: new Map() }
  },
})

const pageStore = (editor: Editor): PageContextStorage =>
  (editor.storage as unknown as { pageContext: PageContextStorage }).pageContext

/** Give a section's editor its place in the page. */
export function setPageContext(editor: Editor, get: () => PageContext): void {
  pageStore(editor).get = get
}

/* ------------------------------------------------------------------ *
 * new checklists, in a <Checklist> box of their own
 * ------------------------------------------------------------------ */

// A `- [ ]` list on the site is only tickable inside `<Checklist id="…">`: the
// box is what turns the boxes on and remembers each reader's ticks, under its
// id. A list typed or pasted outside one would show boxes nobody can tick, and
// typing the tags by hand only gets them written out as text (PR #678). So a
// checklist the contributor adds gets the box when the section is written out.
//
// Which lists are new: everything at the top of a section that wasn't already
// there as a bare list when the section opened. Two pages have bare lists on
// purpose (incident templates, to copy), and `bare` keeps them as they are.

const TASK_LISTS = new Set(['taskList', 'numberedTaskList'])

// The box's tags, on lines of their own. Markdown reads a tag line as a block of
// HTML that runs to the next blank line, which would swallow the list under it
// as text, so the tags are given blank lines before the markdown is read. Code
// blocks are left alone: a docs page can show the tags as an example.
const CHECKLIST_TAG_LINE_RE = /^ {0,3}<\/?Checklist(?:\s[^<>]*)?>\s*$/
const FENCE_LINE_RE = /^\s*(`{3,}|~{3,})/
const tagsSetUp = new WeakSet<object>()

function separateChecklistTags(src: string): string {
  let fence: string | null = null
  return src
    .split('\n')
    .map((line) => {
      const f = line.match(FENCE_LINE_RE)
      if (f) {
        if (!fence) fence = f[1]
        else if (f[1][0] === fence[0] && f[1].length >= fence.length) fence = null
        return line
      }
      return !fence && CHECKLIST_TAG_LINE_RE.test(line) ? `\n${line}\n` : line
    })
    .join('\n')
}

// Reading a section that already has a box in it: a draft being restored, or
// markdown pasted with the tags. The list inside is marked as boxed and the tag
// itself dropped, since the editor has no node for it; the box comes back when
// the section is written out.
const ChecklistBoxes = Extension.create({
  name: 'checklistBoxes',
  addStorage() {
    return {
      markdown: {
        parse: {
          setup(md: { core: { ruler: { after(a: string, b: string, f: (s: { src: string }) => void): void } } }) {
            if (tagsSetUp.has(md)) return
            tagsSetUp.add(md)
            md.core.ruler.after('normalize', 'fw_checklist_tags', (state) => {
              state.src = separateChecklistTags(state.src)
            })
          },
          updateDOM(element: HTMLElement) {
            element.querySelectorAll('checklist').forEach((box) => {
              for (const child of Array.from(box.children)) {
                if (child.tagName === 'UL' || child.tagName === 'OL') child.setAttribute('data-boxed', 'true')
              }
              box.replaceWith(...Array.from(box.childNodes))
            })
          },
        },
      },
    }
  },
})

/** A checklist id from a heading: "Web Presence" → `web-presence`, as the docs
 *  write them. */
const checklistSlug = (text: string): string =>
  text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/, '')

/**
 * Mark the bare checklists a section opened with, so they stay as they are.
 * Called once, when the section's editor is created, and before its safety
 * check, which compares against the page as written.
 */
export function markExistingChecklists(editor: Editor): void {
  const { state } = editor
  const tr = state.tr
  state.doc.forEach((node, pos) => {
    if (TASK_LISTS.has(node.type.name) && !node.attrs.boxed) {
      tr.setNodeMarkup(pos, undefined, { ...node.attrs, bare: true })
    }
  })
  if (!tr.docChanged) return
  tr.setMeta('addToHistory', false)
  editor.view.dispatch(tr)
}

// Ids for this write: from the heading above each new checklist, and unique on
// the page, the way the docs number them (`safety-setup`, `safety-setup-2`).
function assignChecklistIds(editor: Editor): void {
  const store = pageStore(editor)
  store.ids = new Map()
  const ctx = store.get?.()
  if (!ctx?.boxChecklists) return
  const used = new Set(ctx.usedIds)
  let heading = ctx.headingAbove?.text ?? ''
  editor.state.doc.forEach((node) => {
    if (node.type.name === 'heading') heading = node.textContent
    if (!TASK_LISTS.has(node.type.name) || node.attrs.bare) return
    const base = checklistSlug(heading) || 'checklist'
    let id = base
    for (let n = 2; used.has(id); n++) id = `${base}-${n}`
    used.add(id)
    store.ids.set(node, id)
  })
}

// Write a list, inside its box when it has an id for this write. The tags sit
// right against the list, with no blank line, as in every checklist the docs
// have.
function writeBoxed(editor: Editor, state: MdState, node: unknown, writeList: () => void): void {
  const id = pageStore(editor).ids.get(node)
  if (!id) return writeList()
  state.write(`<Checklist id="${id}">`)
  state.ensureNewLine()
  writeList()
  state.flushClose(1)
  state.write('</Checklist>')
  state.closeBlock(node)
}

const boxAttributes = {
  // Came out of a `<Checklist>` box in the section's own text.
  boxed: {
    default: false,
    parseHTML: (el: HTMLElement) => el.getAttribute('data-boxed') === 'true',
    renderHTML: () => ({}),
  },
  // Was in the page as a bare list; see `markExistingChecklists`.
  bare: {
    default: false,
    parseHTML: () => false,
    renderHTML: () => ({}),
  },
}

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
      ...boxAttributes,
    }
  },
  // Only `serialize`: the converter's own reading of `- [ ]` lists stays.
  addStorage() {
    return {
      markdown: {
        serialize(this: { editor: Editor }, state: MdState, node: unknown) {
          writeBoxed(this.editor, state, node, () => state.renderList(node, '  ', () => '- '))
        },
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
        serialize(this: { editor: Editor }, state: MdState, node: MdNode) {
          const start = Number(node.attrs.start) || 1
          const width = String(start + node.childCount - 1).length
          writeBoxed(this.editor, state, node, () =>
            state.renderList(node, state.repeat(' ', width + 2), (i) => {
              const n = String(start + i)
              return state.repeat(' ', width - n.length) + n + '. '
            }),
          )
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

// Enter at the very start of a heading. The editor's rule splits the heading
// in two, so the new empty line above is a heading too, and whatever is typed
// there comes out as one. In a page, the only way to add text above a section's
// first heading ("#### Community Features") is this, so a contributor's whole
// new paragraph went out as `####` (PR #678). Here the line above is ordinary
// text, and the cursor stays at the start of the heading, as in Notion.
const EnterAboveHeading = Extension.create({
  name: 'enterAboveHeading',
  // Ahead of the editor's own Enter. Anywhere else it does nothing.
  priority: 1000,
  addKeyboardShortcuts() {
    return {
      Enter: ({ editor }) => {
        const { $from, empty } = editor.state.selection
        if (!empty || $from.parent.type.name !== 'heading') return false
        if ($from.parentOffset !== 0 || $from.parent.content.size === 0) return false
        const paragraph = editor.schema.nodes.paragraph
        const index = $from.index(-1)
        if (!$from.node(-1).canReplaceWith(index, index, paragraph)) return false
        return editor.commands.command(({ tr, dispatch }) => {
          if (dispatch) tr.insert($from.before(), paragraph.create()).scrollIntoView()
          return true
        })
      },
    }
  },
})

// `- [ ] ` typed the way markdown writes a checklist item. `- ` makes a bulleted
// list first, and the checklist shortcut that `[ ] ` then sets off would put a
// checklist inside that bullet. Here it turns the bulleted list into a checklist
// instead. (`[ ] ` at the start of an ordinary line already makes one.)
const ChecklistFromBullet = Extension.create({
  name: 'checklistFromBullet',
  // Ahead of the checklist item's own shortcut, which would nest.
  priority: 1000,
  addInputRules() {
    return [
      new InputRule({
        find: /^\s*\[( |x|X)?\]\s$/,
        handler: ({ state, range, chain }) => {
          const $from = state.doc.resolve(range.from)
          // The first line of an item in a bulleted list.
          if ($from.depth < 3 || $from.index(-1) !== 0) return null
          if ($from.node(-1).type.name !== 'listItem' || $from.node(-2).type.name !== 'bulletList') return null
          chain().deleteRange(range).toggleTaskList().run()
        },
      }),
    ]
  },
})

/**
 * The heading levels a line may take where the cursor is: never more than one
 * below the heading above it, the rule the docs' lint checks (MD001). The
 * heading above can be in an earlier section, which only the page knows.
 */
export function headingLimit(editor: Editor): { above: number; max: number } {
  const { $from } = editor.state.selection
  const top = $from.index(0)
  let above = pageStore(editor).get?.()?.headingAbove?.level ?? 1
  editor.state.doc.forEach((node, _pos, i) => {
    if (i < top && node.type.name === 'heading') above = Number(node.attrs.level)
  })
  return { above, max: above + 1 }
}

// Real formatting in pasted HTML, as opposed to a code editor's colouring.
const FORMATTING_TAG_RE = /<(?:p|h[1-6]|ul|ol|li|strong|b|em|i|a|table|blockquote|pre|code|img)\b/i

/**
 * Paste from a code editor as markdown. VS Code (and editors like it) put the
 * text on the clipboard twice: as plain text, and as HTML that only colours it
 * (`<div>`s and `<span>`s). The editor prefers the HTML, which made the markdown
 * plain text, `- [ ]` and all. When the HTML carries no real formatting, the
 * plain text is read as markdown instead. Anything else (a web page, Google
 * Docs, Word) is pasted the usual way.
 */
export function pasteCodeEditorMarkdown(editor: Editor | null, event: ClipboardEvent): boolean {
  const data = event.clipboardData
  if (!editor || editor.isDestroyed || !data) return false
  const html = data.getData('text/html')
  const text = data.getData('text/plain')
  if (!html || !text || FORMATTING_TAG_RE.test(html)) return false
  // tiptap-markdown reads a string given to insertContent as markdown.
  return editor.commands.insertContent(text)
}

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
  EnterAboveHeading,
  ChecklistFromBullet,
  ChecklistBoxes,
  PageContextExtension,
  Markdown.configure({
    html: true,
    tightLists: true,
    bulletListMarker: '-',
    linkify: false,
    breaks: false,
    // Pasted plain text is read as markdown, so a contributor who drafted in
    // markdown (or asked an AI to) gets headings, lists and checklists, not
    // the symbols. Cmd/Ctrl+Shift+V still pastes it as it is. Copies from a
    // code editor come with HTML; see `pasteCodeEditorMarkdown`.
    transformPastedText: true,
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
  assignChecklistIds(editor)
  const md =(editor.storage as unknown as { markdown: { getMarkdown(): string } }).markdown.getMarkdown()
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
