import StarterKit from '@tiptap/starter-kit'
import { Table, TableRow, TableHeader, TableCell } from '@tiptap/extension-table'
import { Image } from '@tiptap/extension-image'
import { Markdown } from 'tiptap-markdown'

// One shared extension set for every prose block, so what round-trips in the
// fidelity check is exactly what runs in the browser.
//
// `bulletListMarker: '-'` matches the repo's dominant style, and `linkify` and
// `breaks` stay off so the serializer never invents markup the author didn't
// write.
export const proseExtensions = [
  StarterKit.configure({
    heading: { levels: [1, 2, 3, 4, 5, 6] },
    // Docs link to each other with root-relative paths. Following one from
    // inside the editor would navigate the wizard away and lose the edit, so
    // links are inert while editing — the Review step is where they work.
    link: { openOnClick: false, autolink: false },
  }),
  Table.configure({ resizable: false }),
  TableRow,
  TableHeader,
  TableCell,
  Image,
  Markdown.configure({
    html: true,
    tightLists: true,
    bulletListMarker: '-',
    linkify: false,
    breaks: false,
  }),
]
