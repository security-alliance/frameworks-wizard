import { useEffect, useRef, useState } from 'react'
import { EditorContent, useEditor } from '@tiptap/react'
import type { Editor } from '@tiptap/react'
import { proseExtensions } from '../../lib/tiptapConfig.js'
import { toSourceMarkdown, sameContent } from '../../lib/markdown.js'
import type { Block } from '../../lib/types.js'
import { LockSmallIcon } from '../ui.js'

// `tiptap-markdown` hangs its serializer off `editor.storage`, which the core
// types leave open-ended. Naming the one piece we use keeps the two call sites
// below honest without pulling in an ambient module declaration.
type MarkdownEditor = Editor & {
  storage: { markdown: { getMarkdown: () => string } }
}

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
  onChange,
  onFocusEditor,
}: {
  block: Block
  /** The page's hard-wrap width, from `wrapWidth`. */
  wrap: number
  onChange: (id: string, text: string) => void
  onFocusEditor: (editor: Editor) => void
}) {
  const [safe, setSafe] = useState<boolean | null>(null) // null = still checking
  const [showSource, setShowSource] = useState(false)
  const guard = useRef(false)

  const editor = useEditor(
    {
      extensions: proseExtensions,
      content: block.text,
      editable: true,
      onCreate({ editor }) {
        const back = (editor as MarkdownEditor).storage.markdown.getMarkdown()
        setSafe(sameContent(back, block.text))
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
        onChange(
          block.id,
          toSourceMarkdown((editor as MarkdownEditor).storage.markdown.getMarkdown(), wrap),
        )
      },
      onFocus({ editor }) {
        onFocusEditor(editor)
      },
    },
    [block.id],
  )

  useEffect(() => {
    // The second argument is `emitUpdate`, and it defaults to true.
    if (editor && safe === false) editor.setEditable(false, false)
  }, [editor, safe])

  if (safe === false) {
    return (
      <div className="rounded-lg border border-fw-border-soft bg-fw-surface-2/30">
        <div className="flex items-center gap-2 px-3 py-1.5 text-[11px] text-fw-faint">
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
          <pre className="mx-2 mb-2 overflow-x-auto whitespace-pre-wrap wrap-break-word rounded-md border border-fw-border bg-fw-bg p-3 text-[12px] leading-relaxed text-fw-muted">
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

  return (
    <div className="fw-editor prose-preview rounded-lg px-2 transition-colors focus-within:bg-fw-surface-2/40">
      <EditorContent editor={editor} />
    </div>
  )
}
