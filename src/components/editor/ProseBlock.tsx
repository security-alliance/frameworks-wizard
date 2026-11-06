import { useEffect, useRef, useState } from 'react'
import { EditorContent, useEditor } from '@tiptap/react'
import type { Editor } from '@tiptap/react'
import {
  editorMarkdown,
  markExistingChecklists,
  pasteCodeEditorMarkdown,
  proseExtensions,
  setPageContext,
} from '../../lib/tiptapConfig.js'
import type { PageContext } from '../../lib/tiptapConfig.js'
import {
  commonIndent,
  dedent,
  mdxIndents,
  reindent,
  sameContent,
  toSourceMarkdown,
} from '../../lib/markdown.js'
import type { Block } from '../../lib/types.js'
import { LockSmallIcon, PencilIcon } from '../ui.js'

// One section of the page, edited as rich text — no markdown syntax visible.
//
// The safety gate is `checked`/`safe`: on mount the block's source is parsed and
// immediately re-serialized. If the text that comes back isn't the same content,
// this block's formatting is something the visual editor would rewrite, so the
// visual editor is refused for it and the block is shown read-only. About 1 in 5
// sections hit this — nearly all of them tables, or links wrapped around inline
// code, which the markdown serializer flattens. The rest get full rich-text
// editing.
export default function ProseBlock({
  block,
  wrap,
  context,
  onChange,
  onFocusEditor,
}: {
  block: Block
  /** The page's hard-wrap width, from `wrapWidth`. */
  wrap: number
  /** Where this section sits in the page: the heading above it, and the
   *  checklist ids already taken. */
  context: PageContext
  onChange: (id: string, text: string) => void
  onFocusEditor: (editor: Editor) => void
}) {
  const [safe, setSafe] = useState<boolean | null>(null) // null = still checking
  const [showSource, setShowSource] = useState(false)
  const guard = useRef(false)
  // For the paste handler below, which is set up before `useEditor` returns.
  const editorRef = useRef<Editor | null>(null)
  // The editor is created once, so it reads the page as it is now through this.
  const contextRef = useRef(context)
  contextRef.current = context
  // Text inside a component can be indented as a whole, which MDX ignores but
  // the editor would read as a code block. It edits the text without that
  // indent, and every line it writes gets the indent back, so the section keeps
  // the shape it had in the page.
  const indent = block.inside ? commonIndent(block.text) : ''

  const editor = useEditor(
    {
      extensions: proseExtensions,
      content: mdxIndents(dedent(block.text, indent)),
      editable: true,
      editorProps: {
        handlePaste: (_view, event) =>
          !!editorRef.current?.isEditable && pasteCodeEditorMarkdown(editorRef.current, event),
      },
      onBeforeCreate({ editor }) {
        setPageContext(editor, () => contextRef.current)
      },
      onCreate({ editor }) {
        // Before the safety check, which compares against the page as written:
        // a bare checklist already in the page stays bare.
        markExistingChecklists(editor)
        setSafe(sameContent(editorMarkdown(editor), dedent(block.text, indent)))
        guard.current = true
      },
      onUpdate({ editor }) {
        // Only a person typing counts as an edit. Two things get filtered here:
        // the echo from initial parsing, and programmatic transactions.
        // `setEditable(false)` below emits an `update` by default, which would
        // make every read-only block report itself as edited the moment it
        // mounted. `updateBlock` re-checks the content too, but a serialization
        // that nobody asked for shouldn't get that far.
        if (!guard.current || !editor.isFocused) return
        const md = editorMarkdown(editor)
        onChange(block.id, reindent(toSourceMarkdown(md, wrap - indent.length), indent))
      },
      onFocus({ editor }) {
        onFocusEditor(editor)
      },
    },
    [block.id],
  )
  editorRef.current = editor

  useEffect(() => {
    // The second argument is `emitUpdate`, and it defaults to true.
    if (editor && safe === false) editor.setEditable(false, false)
  }, [editor, safe])

  if (safe === false) {
    return (
      <div className="rounded-lg border border-fw-border-soft bg-fw-surface-2/30">
        <div className="flex items-center gap-2 px-3 py-1.5 text-[0.6875rem] text-fw-faint">
          <LockSmallIcon width="12" height="12" />
          <span>Read-only. This section&apos;s layout can&apos;t survive a visual edit</span>
          <button
            onClick={() => setShowSource((s) => !s)}
            className="ml-auto shrink-0 rounded px-1.5 py-0.5 font-medium text-fw-muted hover:bg-fw-surface-2 hover:text-fw-text"
          >
            {showSource ? 'Show page' : 'Show text'}
          </button>
        </div>
        {showSource ? (
          <pre className="mx-2 mb-2 overflow-x-auto whitespace-pre-wrap wrap-break-word rounded-md border border-fw-border bg-fw-bg p-3 text-[0.75rem] leading-relaxed text-fw-muted">
            {block.text}
          </pre>
        ) : (
          <div className="prose-preview fw-editor px-3 pb-1">
            <EditorContent editor={editor} />
          </div>
        )}
      </div>
    )
  }

  // Editable has to show before the click. A page of plain text gives no hint
  // that any of it can be typed into, so hovering a section looks the way a
  // focused one does (surface, outline), with an "Edit" chip in the corner.
  // The chip is decoration, so it's out of the way of the pointer and of screen
  // readers, and gone once the section has the cursor. The right padding keeps
  // it off the text. Locked sections render elsewhere and get none of this.
  return (
    <div className="group fw-editor prose-preview relative cursor-text rounded-lg px-2 pr-14 outline-1 outline-transparent transition-colors hover:bg-fw-surface-2/60 hover:outline-fw-border focus-within:bg-fw-surface-2/60 focus-within:outline-fw-border motion-reduce:transition-none">
      <span
        aria-hidden
        className="pointer-events-none absolute right-2 top-1.5 hidden items-center gap-1 rounded-md border border-fw-border bg-fw-surface px-1.5 py-0.5 text-[0.6875rem] font-medium text-fw-muted group-hover:flex group-focus-within:hidden!"
      >
        <PencilIcon width={11} height={11} />
        Edit
      </span>
      <EditorContent editor={editor} />
    </div>
  )
}
