import { useMemo, useState } from 'react'
import { Card, SearchIcon } from '../components/ui.js'
import { titleize } from '../lib/format.js'
import { toSegments } from '../lib/pageGroups.js'
import EditingSummary from './choose/EditingSummary.js'
import type { FrameworkGroup, PageEntry } from '../lib/types.js'

// Two-panel page browser: topics on the left, that topic's pages (grouped by
// subfolder) on the right — mirroring the docs sidebar contributors already know.
//
// With 350+ pages across 20+ topics, browsing alone is a lot to ask of someone
// who just wants to fix one paragraph, so a search box short-circuits the two
// panels and searches every page at once.
export default function ChoosePageStep({
  groups,
  framework,
  path,
  current,
  onPickFramework,
  onPickPage,
}: {
  groups: FrameworkGroup[]
  framework: string
  path: string
  current?: PageEntry
  onPickFramework: (framework: string) => void
  onPickPage: (path: string) => void
}) {
  const [query, setQuery] = useState('')
  const loading = groups.length === 0
  const q = query.trim().toLowerCase()

  const activeGroup = groups.find((g) => g.framework === framework)
  const segments = activeGroup ? toSegments(activeGroup.pages) : []

  // Flat cross-topic search results, capped so the list stays scannable.
  const results = useMemo(() => {
    if (!q) return []
    return groups
      .flatMap((g) => g.pages)
      .filter((p) =>
        [p.name, p.framework, ...p.subdir].some((s) =>
          titleize(s).toLowerCase().includes(q),
        ),
      )
      .slice(0, 60)
  }, [groups, q])

  return (
    <Card className="mx-auto max-w-3xl overflow-hidden p-0">
      <div className="border-b border-fw-border px-6 py-5">
        <h2 className="text-xl font-semibold text-fw-strong">
          Which page would you like to improve?
        </h2>
        <p className="mt-1.5 text-sm text-fw-muted">
          Pick a topic on the left, then a page. Or search for one by name.
        </p>

        <div className="relative mt-4">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fw-faint">
            <SearchIcon />
          </span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search all pages…"
            className="w-full rounded-lg border border-fw-border bg-fw-surface-2 py-2.5 pl-10 pr-3 text-sm text-fw-text placeholder:text-fw-faint focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
          />
        </div>
      </div>

      {q ? (
        <SearchResults results={results} path={path} onPickPage={onPickPage} />
      ) : (
        <div className="flex h-105 flex-col sm:flex-row">
          <aside className="w-full shrink-0 overflow-y-auto border-b border-fw-border bg-fw-surface-2/30 py-2 sm:w-56 sm:border-b-0 sm:border-r">
            {loading ? (
              <div className="px-4 py-3 text-sm text-fw-faint">Loading…</div>
            ) : (
              groups.map((g) => {
                const active = g.framework === framework
                return (
                  <button
                    key={g.framework}
                    onClick={() => onPickFramework(g.framework)}
                    className={`flex w-full items-center justify-between gap-2 px-4 py-2 text-left text-sm transition-colors ${
                      active
                        ? 'bg-brand/15 font-medium text-fw-strong'
                        : 'text-fw-muted hover:bg-fw-surface-2 hover:text-fw-text'
                    }`}
                  >
                    <span className="truncate">{titleize(g.framework)}</span>
                    {active && (
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />
                    )}
                  </button>
                )
              })
            )}
          </aside>

          <div className="min-w-0 flex-1 overflow-y-auto py-2">
            {!activeGroup ? (
              <div className="px-5 py-4 text-sm text-fw-faint">
                Select a topic to see its pages.
              </div>
            ) : (
              segments.map((seg) => (
                <div key={seg.key || '_root'} className="mb-1">
                  {seg.label && (
                    <div className="px-5 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wide text-fw-faint">
                      {seg.label}
                    </div>
                  )}
                  {seg.pages.map((p) => (
                    <PageRow
                      key={p.path}
                      page={p}
                      active={p.path === path}
                      onPick={onPickPage}
                    />
                  ))}
                </div>
              ))
            )}
          </div>
        </div>
      )}

      <EditingSummary current={current} />
    </Card>
  )
}

function SearchResults({
  results,
  path,
  onPickPage,
}: {
  results: PageEntry[]
  path: string
  onPickPage: (path: string) => void
}) {
  if (results.length === 0) {
    return (
      <div className="flex h-105 items-center justify-center px-6 text-center text-sm text-fw-faint">
        No pages match that search.
      </div>
    )
  }
  return (
    <div className="h-105 overflow-y-auto py-2">
      {results.map((p) => (
        <PageRow
          key={p.path}
          page={p}
          active={p.path === path}
          onPick={onPickPage}
          context={[p.framework, ...p.subdir].map(titleize).join(' › ')}
        />
      ))}
    </div>
  )
}

function PageRow({
  page,
  active,
  onPick,
  context,
}: {
  page: PageEntry
  active: boolean
  onPick: (path: string) => void
  context?: string
}) {
  return (
    <button
      onClick={() => onPick(page.path)}
      className={`flex w-full items-center gap-2 px-5 py-1.5 text-left text-sm transition-colors ${
        active
          ? 'font-medium text-brand-hover'
          : 'text-fw-muted hover:bg-fw-surface-2 hover:text-fw-text'
      }`}
    >
      <span
        className={`h-1.5 w-1.5 shrink-0 rounded-full ${
          active ? 'bg-brand' : 'bg-transparent'
        }`}
      />
      <span className="truncate">{titleize(page.name)}</span>
      {context && (
        <span className="ml-auto shrink-0 truncate pl-3 text-xs text-fw-faint">
          {context}
        </span>
      )}
    </button>
  )
}
