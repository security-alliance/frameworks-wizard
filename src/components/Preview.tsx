import { useMemo } from 'react'
import type { ComponentProps, RefObject } from 'react'
import ReactMarkdown from 'react-markdown'
import type { Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeRaw from 'rehype-raw'
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize'
import { segmentBody } from '../lib/mdxPreview.js'
import type { CodeSegment } from '../lib/mdxPreview.js'
import type { ContributorDirectory, Frontmatter } from '../lib/types.js'
import {
  TagList,
  AttributionList,
  ContributeFooter,
  UnknownComponent,
} from './vocs/VocsComponents.js'

// Raw HTML is enabled so the docs' own <details>/<br> render, and so the Review
// step's <ins>/<del> change marks show up in place. It's paired with sanitize
// rather than trusted blindly: this content arrives over the network, and a
// security org's own tool shouldn't be the one that renders whatever it's given.
const schema = {
  ...defaultSchema,
  tagNames: [...(defaultSchema.tagNames ?? []), 'ins', 'del'],
  attributes: {
    ...defaultSchema.attributes,
    ins: [['className', 'fw-ins']],
    del: [['className', 'fw-del']],
  },
}
// Taken from ReactMarkdown's own props rather than imported from `unified`.
// `unified` is only a transitive dependency here, so importing it directly
// resolves on a developer's machine and then fails the deploy on a clean
// install.
type MarkdownPlugins = ComponentProps<typeof ReactMarkdown>['rehypePlugins']

const rehypePlugins: MarkdownPlugins = [rehypeRaw, [rehypeSanitize, schema]]
const remarkPlugins: MarkdownPlugins = [remarkGfm]

const SITE_URL = 'https://frameworks.securityalliance.org'

// Docs pages link to each other with root-relative paths (`](/intro/introduction)`
// — hundreds of them). Left alone, clicking one inside the preview navigates the
// wizard's own SPA to a route it doesn't have, and the contributor loses their
// edits. Point those at the live site instead, and open every outbound link in a
// new tab so the wizard is never replaced.
const components: Components = {
  a({ href = '', children, ...props }) {
    const isAnchor = href.startsWith('#')
    const resolved = href.startsWith('/') ? SITE_URL + href : href
    return (
      <a
        href={resolved}
        {...(isAnchor ? {} : { target: '_blank', rel: 'noopener noreferrer' })}
        {...props}
      >
        {children}
      </a>
    )
  },
}

// Renders the edited body as it will roughly appear on the live site: markdown
// via react-markdown, and the shared Vocs components rendered from frontmatter.
export default function Preview({
  body,
  frontmatter,
  contributors,
  scrollRef,
}: {
  body: string
  frontmatter?: Frontmatter
  contributors?: ContributorDirectory
  scrollRef?: RefObject<HTMLDivElement | null>
}) {
  const blocks = useMemo(() => segmentBody(body), [body])
  const fm = frontmatter ?? {}

  return (
    <div ref={scrollRef} className="h-full overflow-auto bg-fw-bg">
      <article className="prose-preview mx-auto max-w-3xl px-8 py-6">
        {blocks.map((block, i) => {
          switch (block.type) {
            case 'taglist':
              return <TagList key={i} tags={fm.tags} />
            case 'attribution':
              return (
                <AttributionList
                  key={i}
                  contributors={fm.contributors}
                  contributorData={contributors}
                />
              )
            case 'footer':
              return <ContributeFooter key={i} />
            case 'code':
              return <ChangedCode key={i} block={block} />
            case 'unknown':
              return <UnknownComponent key={i} name={block.name} />
            case 'md':
              return (
                <ReactMarkdown
                  key={i}
                  remarkPlugins={remarkPlugins}
                  rehypePlugins={rehypePlugins}
                  components={components}
                >
                  {block.text}
                </ReactMarkdown>
              )
          }
        })}
      </article>
    </div>
  )
}

// A code block with changed lines. Rendered here rather than through
// react-markdown because markdown parses nothing inside a fence — an <ins> put
// there shows up as literal text. The lines come from the review step as
// numbers, so the highlight lives on the element instead of in the source.
function ChangedCode({ block }: { block: CodeSegment }) {
  const lines = block.code.split('\n')
  return (
    <pre>
      <code className={block.lang ? `language-${block.lang}` : undefined}>
        {lines.map((line, i) => {
          const n = i + 1
          const cls = block.ins.has(n)
            ? 'fw-code-ins'
            : block.del.has(n)
              ? 'fw-code-del'
              : undefined
          return (
            <span key={i} className={cls}>
              {line}
              {i < lines.length - 1 ? '\n' : ''}
            </span>
          )
        })}
      </code>
    </pre>
  )
}
