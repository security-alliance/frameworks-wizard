// The page being edited, drawn rather than screenshotted.
//
// One component for both the typing frame and the diff frame. Two
// near-identical mocks of a docs page is how they'd quietly stop matching, and
// the whole point of both is that they're the same page a moment apart.
//
// The bars stand in for the paragraphs above and below the one being edited —
// enough context to read as a document without inventing filler nobody reads.

export const SAMPLE_ORIGINAL = 'Signing keys should be rotated periodically.'
export const SAMPLE_ADDITION = ' Always rotate after a staff change.'

export default function DocFrame({
  /** How much of the addition has been typed. Ignored when `diff` is set. */
  typed = SAMPLE_ADDITION.length,
  /** Show the addition as a settled change rather than as live typing. */
  diff = false,
}: {
  typed?: number
  diff?: boolean
}) {
  return (
    <div className="rounded-lg border border-fw-border bg-fw-surface px-4 py-3.5 sm:px-5">
      <div className="text-[13px] font-semibold text-fw-strong">Key management</div>
      <div className="mt-3 space-y-2">
        <span className="block h-2 w-full rounded-full bg-fw-surface-2" />
        <span className="block h-2 w-4/5 rounded-full bg-fw-surface-2" />
      </div>

      <p className="mt-4 text-[13.5px] leading-relaxed text-fw-text">
        {diff ? (
          <>
            {SAMPLE_ORIGINAL}
            <ins className="rounded-sm bg-add-soft px-0.5 no-underline shadow-[inset_0_-1px_0_var(--fw-add)]">
              {SAMPLE_ADDITION}
            </ins>
          </>
        ) : (
          <>
            {SAMPLE_ORIGINAL}
            <span className="text-fw-text">{SAMPLE_ADDITION.slice(0, typed)}</span>
            <span className="fw-demo-caret" aria-hidden="true" />
          </>
        )}
      </p>

      <div className="mt-4 space-y-2">
        <span className="block h-2 w-11/12 rounded-full bg-fw-surface-2" />
        <span className="block h-2 w-2/3 rounded-full bg-fw-surface-2" />
      </div>

      <div className="mt-4 border-t border-fw-border-soft pt-2.5 text-[11px] text-fw-faint">
        {diff
          ? '1 section changed · nothing else touched'
          : 'docs/pages/ai-security/overview.mdx'}
      </div>
    </div>
  )
}
