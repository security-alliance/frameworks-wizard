import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  fetchPageList,
  splitFrontmatter,
  fetchContributors,
  pageTrail,
  toPageEntry,
} from './lib/github.js'
import { parseFrontmatter } from './lib/frontmatter.js'
import { splitBlocks, updateBlock, isDirty, syncChecklistImport } from './lib/blocks.js'
import type { DetailsStatus } from './components/editor/PageDetails.js'
import { wrapWidth } from './lib/markdown.js'
import { annotateBlocks } from './lib/inlineDiff.js'
import {
  readDraft,
  saveDraft,
  clearDraft,
  applyDraft,
  listDrafts,
  restoreDraft,
  readSuggestion,
  saveSuggestion,
} from './lib/drafts.js'
import type { Draft, DraftSummary, Suggestion } from './lib/drafts.js'
import {
  buildFrontmatter,
  linkOf,
  listNewPages,
  loadPage,
  newPageRaw,
  readNewPage,
  removeNewPage,
  saveNewPage,
  suggestTags,
} from './lib/newPages.js'
import { currentBody, fillMapRow, findMapFile, insertMapRow, linksTo } from './lib/sectionMap.js'
import { PLACEHOLDERS } from './lib/placeholders.js'
import { joinBlocks } from './lib/blocks.js'
import type { NewPage } from './lib/newPages.js'
import { forgetSent, lastSent, rememberSent } from './lib/send.js'
import type { Sent } from './lib/send.js'
import { useAuth } from './lib/useAuth.js'
import { useTheme } from './lib/useTheme.js'
import { useWizardRoute } from './lib/useWizardRoute.js'
import { STEPS, stepIndex } from './wizard/steps.js'
import type { StepId } from './wizard/steps.js'
import Stepper from './components/Stepper.js'
import ScrollNav from './components/ScrollNav.js'
import BrandBar from './components/BrandBar.js'
import { Button, Collapse, ArrowLeft, ArrowRight } from './components/ui.js'
import WelcomeStep from './steps/WelcomeStep.js'
import ChoosePageStep from './steps/ChoosePageStep.js'
import EditStep from './steps/EditStep.js'
import ReviewStep from './steps/ReviewStep.js'
import SubmitStep from './steps/SubmitStep.js'
import DoneStep from './steps/DoneStep.js'
import type { PrAnswers } from './lib/prTemplate.js'
import type {
  Block,
  ContributorDirectory,
  FrameworkGroup,
  Frontmatter,
  PageEntry,
} from './lib/types.js'

// The page the editor opens if the contributor hasn't picked one.
const DEFAULT_PAGE = 'docs/pages/ai-security/overview.mdx'

export default function App() {
  // Step and page live in the URL, so a reload stays where you were.
  const { step: stepIdx, path, chosen, authError, justInstalled, goToStep, goToPage } =
    useWizardRoute(DEFAULT_PAGE)
  const [maxReached, setMaxReached] = useState(stepIdx)

  const auth = useAuth()
  const { theme, toggle } = useTheme()

  // "Remove distractions": the page, the toolbar, and nothing else. Not
  // remembered between visits — landing in a wizard with no stepper and no
  // brand bar reads as a broken page rather than as a preference, so it's a
  // thing you switch on when you settle down to write.
  const [focus, setFocus] = useState(false)

  const [githubGroups, setGroups] = useState<FrameworkGroup[]>([])
  // Pages written from scratch in this browser, listed in their framework
  // where they'll appear in the sidebar. See newPages.ts.
  const [newPages, setNewPages] = useState<NewPage[]>(listNewPages)
  const groups = useMemo(() => withNewPages(githubGroups, newPages), [githubGroups, newPages])
  const [contributors, setContributors] = useState<ContributorDirectory>({})

  // What the contributor says about their change, their answer to the one ask
  // from the PR template that's theirs (`stewardInterest`, volunteering
  // themselves), and which drafts they unticked. One of each for the whole
  // suggestion, whichever page is open, and saved apart from the drafts so a
  // reload or a trip to GitHub keeps them. See `readSuggestion`.
  const [suggestion] = useState(readSuggestion)
  const [note, setNote] = useState(suggestion.note)
  const [answers, setAnswers] = useState<PrAnswers>(suggestion.answers)
  const [leftOut, setLeftOut] = useState<string[]>(suggestion.leftOut)
  useEffect(() => {
    saveSuggestion({ note, answers, leftOut })
  }, [note, answers, leftOut])

  // The page, as editable blocks. `originalBody` is kept for the technical diff;
  // the blocks themselves carry each section's original bytes, so an untouched
  // section always round-trips exactly. `originalRaw` is the whole file as it
  // loaded, frontmatter and all: Send hands it to the backend as the version
  // the edit starts from.
  const [fm, setFm] = useState<Frontmatter>({}) // parsed frontmatter, for preview components
  const [blocks, setBlocks] = useState<Block[]>([])
  const [originalBody, setOriginalBody] = useState('')
  const [originalRaw, setOriginalRaw] = useState('')

  // The suggestion just sent, for the Done step.
  const [sent, setSent] = useState<Sent | null>(() => lastSent())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // What a draft did to the page just loaded, if there was one. Drafts are
  // applied on sight rather than offered:
  //
  // Reloading a page you were writing on has exactly one likely intent, and it
  // isn't "throw my work away". Asking put the burden of a decision on the
  // person least able to make it — they can't see what's in the draft while
  // being asked about it — and the harm is lopsided anyway. Restoring something
  // unwanted costs one click on "Undo all changes", which is already in the
  // header; not restoring costs an afternoon.
  const [restored, setRestored] = useState<{
    applied: number
    skipped: number
  } | null>(null)
  const [drafts, setDrafts] = useState<DraftSummary[]>(() => listDrafts())
  // False once a save has actually failed — private browsing, or a full quota.
  const [persisted, setPersisted] = useState(true)

  // Load the framework/page list + contributor directory once. The list comes
  // from GitHub's API without signing in, which allows 60 requests an hour from
  // one address, so a failure is said, with a way to try again.
  const [listFailed, setListFailed] = useState(false)
  const loadPageList = useCallback(() => {
    setListFailed(false)
    fetchPageList()
      .then(setGroups)
      .catch((e) => {
        console.error('Page list failed:', e)
        setListFailed(true)
      })
  }, [])
  useEffect(() => {
    loadPageList()
    fetchContributors()
      .then(setContributors)
      .catch((e) => console.error('Contributors failed:', e))
  }, [loadPageList])

  // Bumped to load the open page afresh, with its draft: after the wizard
  // itself changes a section (filling a section-map row), whose editor only
  // reads its text when it opens.
  const [reloadKey, setReloadKey] = useState(0)

  // (Re)load the selected page whenever the path changes.
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    loadPage(path)
      .then((raw) => {
        if (cancelled) return
        const { frontmatter: fmRaw, body } = splitFrontmatter(raw)
        setFm(parseFrontmatter(fmRaw))
        setOriginalBody(body)
        setOriginalRaw(raw)

        // Rebuilt from the repo's copy, then the draft laid back over it —
        // never from the drafted text alone, or every section would arrive
        // with its own edit as its "original" and the diff would be empty. 
        const fresh = splitBlocks(body)
        const draft = readDraft(path)
        if (draft) {
          const r = applyDraft(fresh, draft)
          setBlocks(syncChecklistImport(r.blocks))
          setRestored({ applied: r.applied, skipped: r.skipped })
        } else {
          setBlocks(fresh)
          setRestored(null)
        }
        setLoading(false)
      })
      .catch((e: Error) => {
        if (cancelled) return
        setError(e.message)
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [path, reloadKey])

  const dirty = useMemo(() => isDirty(blocks), [blocks])
  // Measured once per page: what width the page is wrapped at, so an edited
  // paragraph is re-wrapped the way the rest of the page already is.
  const wrap = useMemo(() => wrapWidth(originalBody), [originalBody])
  // The annotated page and the count of changed sections. Computed once here
  // because Review renders it and Submit reports it.
  const annotated = useMemo(() => annotateBlocks(blocks), [blocks])
  const step = STEPS[stepIdx]
  const isLast = stepIdx === STEPS.length - 1
  // Only writing has distractions worth removing; every other step *is* the
  // chrome. Leaving the editor drops the mode rather than carrying an empty
  // frame into a form.
  const focused = step.id === 'edit' && focus
  // One width for every step. Tables and code fences would read badly
  // squeezed, but those live in locked blocks, which wrap and scroll on their
  // own and start collapsed. What's actually editable is prose, and prose wants
  // a measured column.
  const shell = 'max-w-6xl'

  const current = useMemo(
    () => groups.flatMap((g) => g.pages).find((p) => p.path === path),
    [groups, path],
  )
  // Any page by path, for the pages of a suggestion. One not in the page list
  // (yet, or any more) gets its slugs made readable.
  const pageEntry = useCallback(
    (p: string) => groups.flatMap((g) => g.pages).find((e) => e.path === p) ?? toPageEntry(p),
    [groups],
  )

  // A draft's page by name, for the drafts menu. A draft can outlive its page in
  // the sidebar, or be listed before the page list has loaded; those get the
  // slugs made readable.
  const pageLabel = useCallback((p: string) => pageTrail(pageEntry(p)), [pageEntry])
  // Something to send: this page's changes, or another page's draft.
  const sendable = dirty || drafts.some((d) => d.path !== path)

  // What the stepper says under each label. Everything here is state the app
  // already holds, shown where you'd look while deciding whether to click back
  // a step.
  //
  // Only the steps with something true to report appear. The rest fall through
  // to their own blurb in STEPS.
  const stepStatus = useMemo<Partial<Record<StepId, string>>>(() => {
    const n = annotated.changedBlocks
    const sections = `${n} section${n === 1 ? '' : 's'}`
    return {
      // Nothing until a page is genuinely on the table. `path` starts on
      // DEFAULT_PAGE so the editor has something to open for anyone who skips
      // the picker, but that is the app's fallback and not the contributor's
      // decision. Reporting it as one would tell someone still reading the
      // welcome screen that they had already chosen AI Security › Overview.
      //
      // From the picker onwards it is fair game whether or not they touched it:
      // the picker highlights that page and the editor opens it, so staying
      // coy about the name would just make the stepper disagree with the screen
      // underneath it. Before then, undefined falls through to "Pick a page".
      //
      // Framework first once there is one, and not only for context: switching
      // framework jumps to that framework's first page (see `pickFramework`),
      // which is almost always `overview.mdx`, so the bare page name would read
      // "Overview" both before and after and the change would look like a no-op.
      choose:
        (chosen || stepIdx >= stepIndex('choose')) && current
          ? `${current.frameworkTitle} › ${current.title}`
          : undefined,
      edit: dirty ? `${sections} changed` : 'nothing changed yet',
      review: dirty ? `${sections} to read back` : 'nothing to check',
      // "Ready to send" waits for the note too: it's the one thing the step
      // actually asks for. Signed out, with the note written, signing in is
      // what's left, and it happens on that step.
      submit: !sendable
        ? 'nothing to send yet'
        : !note.trim()
          ? 'needs a note'
          : auth.status === 'out'
            ? 'sign in to send'
            : 'ready to send',
      done: sent ? `#${sent.number} sent` : undefined,
    }
  }, [
    auth.status,
    chosen,
    stepIdx,
    current,
    dirty,
    sendable,
    note,
    annotated.changedBlocks,
    sent,
  ])

  function pickFramework(fw: string) {
    const group = groups.find((g) => g.framework === fw)
    if (group?.pages.length) goToPage(group.pages[0].path)
  }

  function changeBlock(id: string, text: string) {
    setBlocks((bs) => syncChecklistImport(updateBlock(bs, id, text)))
  }

  // The note and ticks go once no draft is left: a sentence describing edits
  // that no longer exist has nothing left to describe, and leaving it behind
  // would hand it to whatever is written next.
  function forgetSuggestionIfEmpty() {
    const left = listDrafts()
    setDrafts(left)
    if (left.length === 0) {
      setNote('')
      setAnswers({})
      setLeftOut([])
    }
  }

  function resetEdits() {
    setBlocks(splitBlocks(originalBody))
    clearDraft(path)
    setRestored(null)
    forgetSuggestionIfEmpty()
  }

  // A discard can be undone for a few seconds: the draft and the suggestion's
  // note are kept until then, and the menus show "Draft discarded" with Undo
  // where the row was.
  const [discarded, setDiscarded] = useState<
    { summary: DraftSummary; draft: Draft; suggestion: Suggestion; page?: NewPage }[]
  >([])

  // Discarding a new page's draft discards the page: it exists only in this
  // browser, and an empty "New" page left in the list reads as a bug.
  function discardDraft(target: string) {
    const draft = readDraft(target)
    const summary = drafts.find((d) => d.path === target)
    const page = readNewPage(target) ?? undefined
    if (draft && summary) {
      const entry = { summary, draft, suggestion: { note, answers, leftOut }, page }
      setDiscarded((d) => [...d.filter((x) => x.summary.path !== target), entry])
      setTimeout(() => setDiscarded((d) => d.filter((x) => x !== entry)), 6000)
    }
    clearDraft(target)
    if (page) {
      removeNewPage(target)
      setNewPages(listNewPages())
      if (target === path) leaveRemovedPage(target)
    } else if (target === path) {
      setBlocks(splitBlocks(originalBody))
      setRestored(null)
    }
    forgetSuggestionIfEmpty()
  }

  // Off a new page that's gone, to the first page of its framework.
  function leaveRemovedPage(target: string) {
    const group = githubGroups.find((g) => target.startsWith(`docs/pages/${g.framework}/`))
    goToPage(group?.pages[0]?.path ?? DEFAULT_PAGE)
  }

  function undoDiscard(target: string) {
    const entry = discarded.find((x) => x.summary.path === target)
    if (!entry) return
    if (entry.page) {
      saveNewPage(entry.page)
      setNewPages(listNewPages())
    }
    restoreDraft(target, entry.draft)
    setNote(entry.suggestion.note)
    setAnswers(entry.suggestion.answers)
    setLeftOut(entry.suggestion.leftOut)
    if (target === path) {
      setBlocks(syncChecklistImport(applyDraft(splitBlocks(originalBody), entry.draft).blocks))
    }
    setDiscarded((d) => d.filter((x) => x !== entry))
    setDrafts(listDrafts())
  }

  function createPage(page: NewPage) {
    saveNewPage(page)
    setNewPages(listNewPages())
    goToPage(page.path)
    goTo(stepIndex('edit'))
    // Tags start as the ones the section's other pages use most, unless the
    // contributor has picked some by the time they're found.
    suggestTags(sectionPages(page.path).map((p) => p.path)).then((tags) => {
      const now = readNewPage(page.path)
      if (now && now.tags === null) {
        saveNewPage({ ...now, tags })
        setNewPages(listNewPages())
      }
    })
  }

  // The section's pages in the sidebar, without new ones: what a new page can
  // be placed among, and what its tags are suggested from.
  const sectionPages = (pagePath: string) => {
    const folder = pagePath.slice(0, pagePath.lastIndexOf('/'))
    return githubGroups.flatMap((g) => g.pages).filter((p) => p.path.slice(0, p.path.lastIndexOf('/')) === folder)
  }

  // The words of a new page changed: its frontmatter is rebuilt from them. The
  // body, and so every draft over it, is untouched.
  function updatePageDetails(page: NewPage) {
    saveNewPage(page)
    setNewPages(listNewPages())
    if (page.path === path) {
      setFm(parseFrontmatter(buildFrontmatter(page)))
      setOriginalRaw(newPageRaw(page))
    }
  }

  // A new page only exists here, so removing it is final: its draft goes too.
  function removePage(target: string) {
    clearDraft(target)
    removeNewPage(target)
    setNewPages(listNewPages())
    if (target === path) leaveRemovedPage(target)
    forgetSuggestionIfEmpty()
  }

  // The open new page's section map: which overview holds it, and whether it
  // lists the page yet. Worked out again whenever a draft is saved, since
  // adding the row, or removing it, is a draft of the overview.
  const openNew = newPages.find((p) => p.path === path)
  const [map, setMap] = useState<{ page: string; file: string | null; listed: boolean } | null>(null)
  const draftsKey = drafts.map((d) => `${d.path}@${d.savedAt}`).join('|')
  useEffect(() => {
    if (!openNew || githubGroups.length === 0) return
    let live = true
    const existing = new Set(githubGroups.flatMap((g) => g.pages.map((p) => p.path)))
    const route = linkOf(openNew.path)
    findMapFile(openNew.path, existing)
      .then(async (file) => ({ file, listed: file ? linksTo(await currentBody(file), route) : false }))
      .then((r) => live && setMap({ page: openNew.path, ...r }))
      .catch(() => live && setMap({ page: openNew.path, file: null, listed: false }))
    return () => {
      live = false
    }
  }, [openNew?.path, githubGroups, draftsKey])
  const mapFor = openNew && map?.page === openNew.path ? map : null

  const details: DetailsStatus = {
    title: !!openNew?.title.trim(),
    tags: (openNew?.tags?.length ?? 0) > 0,
    description: !!openNew?.description.trim(),
    listed: mapFor ? (mapFor.file ? mapFor.listed : true) : null,
  }

  // Where to scroll once the page opens: the new row in a section map.
  const [scrollTo, setScrollTo] = useState<string | null>(null)
  useEffect(() => {
    if (!scrollTo || loading) return
    const t = setTimeout(() => {
      document.querySelector(`.fw-editor a[href="${scrollTo}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' })
      setScrollTo(null)
    }, 300)
    return () => clearTimeout(t)
  }, [scrollTo, loading])

  // "Add it to the map": the overview joins the suggestion as a draft with one
  // row for the new page, placed after the nearest page before it in the
  // sidebar that the map lists, and opens there.
  async function addToMap(pagePath: string) {
    const page = readNewPage(pagePath)
    const file = map?.page === pagePath ? map.file : null
    if (!page || !file) return
    const route = linkOf(pagePath)
    const group = groups.find((g) => pagePath.startsWith(`docs/pages/${g.framework}/`))
    const order = group?.pages ?? []
    const at = order.findIndex((p) => p.path === pagePath)
    const before = order.slice(0, Math.max(at, 0)).reverse().map((p) => linkOf(p.path))
    try {
      const { body } = splitFrontmatter(await loadPage(file))
      const draft = readDraft(file)
      const fileBlocks = draft ? applyDraft(splitBlocks(body), draft).blocks : splitBlocks(body)
      if (linksTo(joinBlocks(fileBlocks), route)) return openMapAt(file, route)
      for (const b of fileBlocks) {
        const next = insertMapRow(b.text, route, page.title, before)
        if (next !== null) {
          saveDraft(file, updateBlock(fileBlocks, b.id, next))
          setDrafts(listDrafts())
          return openMapAt(file, route)
        }
      }
    } catch (e) {
      console.error('Adding to the section map failed:', e)
    }
  }

  function openMapAt(file: string, route: string) {
    setScrollTo(route)
    if (file === path) setReloadKey((k) => k + 1)
    goToPage(file)
    goTo(stepIndex('edit'))
  }

  // On a section map holding a new page's row that's still a placeholder.
  const rowFor = newPages.find((p) => {
    const route = linkOf(p.path)
    return blocks.some((b) => b.text.includes(`](${route})`) && b.text.includes(PLACEHOLDERS.mapRow))
  })
  const mapRow = rowFor
    ? {
        title: rowFor.title,
        onBack: () => goToPage(rowFor.path),
        onUseDescription: rowFor.description.trim()
          ? () => {
              const route = linkOf(rowFor.path)
              const b = blocks.find((x) => x.text.includes(`](${route})`))
              if (!b) return
              saveDraft(path, updateBlock(blocks, b.id, fillMapRow(b.text, route, rowFor.description.trim())))
              setDrafts(listDrafts())
              setReloadKey((k) => k + 1)
            }
          : undefined,
      }
    : null

  // Once it's sent, the change lives in the pull request, and the drafts sent
  // have done their job. Clearing them is what stops the drafts menu offering
  // to send the same thing twice. Unticked drafts stay, to be sent on their
  // own, but the note described what went out, so it goes.
  function finishSend(result: Sent) {
    for (const p of result.paths) clearDraft(p)
    // A new page sent is in the pull request now. Its record goes, and if it was
    // open, the editor moves off it: there's nothing left here to load.
    const sentNew = result.paths.filter((p) => readNewPage(p))
    for (const p of sentNew) removeNewPage(p)
    if (sentNew.length) setNewPages(listNewPages())
    if (sentNew.includes(path)) leaveRemovedPage(path)
    if (result.paths.includes(path)) {
      setBlocks(splitBlocks(originalBody))
      setRestored(null)
    }
    setDrafts(listDrafts())
    setNote('')
    setAnswers({})
    setLeftOut([])
    setSent(result)
    rememberSent(result)
    goTo(stepIndex('done'))
  }

  // Opening a draft means the page *and* the step it belongs to — landing on
  // the picker with the text quietly reloaded behind it would repeat the
  // problem this is here to solve.
  function openDraft(target: string) {
    goToPage(target)
    goTo(stepIndex('edit'))
  }

  function goTo(idx: number) {
    goToStep(idx)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  const next = () => goTo(stepIdx + 1)
  const back = () => goTo(stepIdx - 1)

  // Arriving on the picker with no list: try again rather than wait forever.
  useEffect(() => {
    if (step.id === 'choose' && listFailed) loadPageList()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step.id])

  // Deep links and Back/Forward move the step without going through `goTo`, so
  // the stepper's "how far you've got" mark is kept in step with the URL.
  useEffect(() => {
    setMaxReached((m) => Math.max(m, stepIdx))
  }, [stepIdx])

  // Esc leaves focus mode. With the stepper, the brand bar and the step
  // controls all hidden, the one habit everybody already has for "give me the
  // page back" needs to work, or the mode is a room without a handle.
  useEffect(() => {
    if (!focused) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFocus(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [focused])

  // Keep the draft written as they type.
  useEffect(() => {
    if (loading || error) return
    // A draft that landed on nothing is still the only copy of that work. If
    // every section had moved out from under it, the page on screen is pristine
    // and saving now would replace the draft with "no edits" and delete it.
    if (restored && restored.applied === 0 && restored.skipped > 0) return
    const t = setTimeout(() => {
      setPersisted(saveDraft(path, blocks))
      setDrafts(listDrafts())
      // A new page's title is its heading: the sidebar and the frontmatter
      // follow it as it's edited.
      const created = readNewPage(path)
      const heading = blocks.find((b) => b.kind === 'title')?.text.replace(/^#\s+/, '').trim()
      if (created && heading && heading !== created.title) updatePageDetails({ ...created, title: heading })
    }, 700)
    return () => clearTimeout(t)
  }, [blocks, loading, error, restored, path])

  // On the way out, save the last word synchronously — `localStorage` writes
  // block, so the debounce above can't swallow it.
  //
  // No "leave this page?" confirm by default: with the draft saved, a reload
  // costs nothing, and warning people about a danger that isn't there teaches
  // them to click through warnings. It's shown only where the save genuinely
  // failed, which is the one case where the work really is at risk.
  useEffect(() => {
    if (!dirty) return
    const save = () => {
      setPersisted(saveDraft(path, blocks))
    }
    const warn = (e: BeforeUnloadEvent) => {
      save()
      if (!persisted) e.preventDefault()
    }
    window.addEventListener('beforeunload', warn)
    window.addEventListener('pagehide', save)
    return () => {
      window.removeEventListener('beforeunload', warn)
      window.removeEventListener('pagehide', save)
    }
  }, [dirty, path, blocks, persisted])

  return (
    <div className="fw-app-bg min-h-full">
      <BrandBar
        auth={auth}
        theme={theme}
        onToggleTheme={toggle}
        minimal={focused}
        drafts={drafts}
        currentPath={path}
        pageLabel={pageLabel}
        onOpenDraft={openDraft}
        onDiscardDraft={discardDraft}
        discarded={discarded.map((x) => x.summary)}
        onUndoDiscard={undoDiscard}
      />

      <div className={`mx-auto px-4 py-8 transition-[max-width] duration-200 ${shell}`}>
        {/* The gap below the stepper folds away with it, so the editor rises by
            the whole height the chrome gave up rather than stopping 40px short
            of it. */}
        <Collapse open={!focused}>
          <div className="pb-10">
            <Stepper
              current={stepIdx}
              maxReached={maxReached}
              onJump={goTo}
              status={stepStatus}
            />
          </div>
        </Collapse>

        <main>
          {step.id === 'welcome' && <WelcomeStep onNext={next} />}
          {step.id === 'choose' && (
            <ChoosePageStep
              groups={groups}
              framework={current?.framework ?? ''}
              path={path}
              current={current}
              onPickFramework={pickFramework}
              onPickPage={goToPage}
              listFailed={listFailed}
              onRetry={loadPageList}
              onCreatePage={createPage}
              onRemoveNew={removePage}
            />
          )}
          {step.id === 'edit' && (
            <EditStep
              loading={loading}
              error={error}
              blocks={blocks}
              wrap={wrap}
              onChangeBlock={changeBlock}
              dirty={dirty}
              onReset={resetEdits}
              current={current}
              newPage={openNew}
              siblings={openNew ? sectionPages(openNew.path) : []}
              details={details}
              onChangeDetails={updatePageDetails}
              onAddToMap={mapFor?.file ? () => addToMap(path) : undefined}
              mapRow={mapRow}
              focus={focused}
              onToggleFocus={() => setFocus((f) => !f)}
              restored={restored}
              onDiscardDraft={() => discardDraft(path)}
              onDismissRestored={() => setRestored(null)}
              persisted={persisted}
            />
          )}
          {step.id === 'review' && (
            <ReviewStep
              blocks={blocks}
              fm={fm}
              originalBody={originalBody}
              contributors={contributors}
              dirty={dirty}
              isNew={!!current?.isNew}
              mapNudge={
                openNew && mapFor?.file && !mapFor.listed && !openNew.mapSkipped
                  ? {
                      where: pageEntry(mapFor.file),
                      onAdd: () => addToMap(path),
                      onSkip: () => updatePageDetails({ ...openNew, mapSkipped: true }),
                    }
                  : null
              }
            />
          )}
          {step.id === 'submit' && (
            <SubmitStep
              path={path}
              current={current}
              fm={fm}
              contributorData={contributors}
              auth={auth}
              authError={authError}
              justInstalled={justInstalled}
              blocks={blocks}
              originalBody={originalBody}
              originalRaw={originalRaw}
              dirty={dirty}
              drafts={drafts}
              pageEntry={pageEntry}
              note={note}
              onNote={setNote}
              answers={answers}
              onAnswer={(id, on) => setAnswers((a) => ({ ...a, [id]: on }))}
              leftOut={leftOut}
              onTick={(p, on) =>
                setLeftOut((l) => (on ? l.filter((x) => x !== p) : [...new Set([...l, p])]))
              }
              onGoTo={(id) => goTo(stepIndex(id))}
              onAddPage={() => goTo(stepIndex('choose'))}
              onCheckPage={(p) => {
                goToPage(p)
                goTo(stepIndex('review'))
              }}
              onSent={finishSend}
              onChangeNewPage={updatePageDetails}
            />
          )}
          {step.id === 'done' && (
            <DoneStep
              sent={sent}
              onGoTo={(id) => {
                // A new suggestion starts: the last one lives in the account
                // menu now, and "#21 sent" would be about the wrong thing.
                if (id === 'choose') {
                  setSent(null)
                  forgetSent()
                }
                goTo(stepIndex(id))
              }}
            />
          )}
        </main>

        {/* Nav controls (Welcome has its own CTA; Send's "next" is its own
            Send button, and Done has none; focus mode folds them away — Exit
            focus brings them back) */}
        {step.id !== 'welcome' && (
          <Collapse open={!focused}>
            <div className="mx-auto mt-8 flex max-w-4xl items-center justify-between">
              <Button variant="ghost" onClick={back} disabled={stepIdx === 0}>
                <ArrowLeft /> Back
              </Button>

              {/* The phone stepper already says it, right above. */}
              <span className="hidden text-xs text-fw-faint sm:inline">
                Step {stepIdx + 1} of {STEPS.length}
              </span>

              {isLast || step.id === 'submit' ? (
                <span className="w-23" /> // spacer to keep "Back" left-aligned
              ) : (
                <Button onClick={next}>
                  {step.next ?? 'Continue'} <ArrowRight />
                </Button>
              )}
            </div>
          </Collapse>
        )}
      </div>

      <ScrollNav />
    </div>
  )
}

/**
 * The page list with this browser's new pages in it, each placed where it will
 * show in the sidebar: after the page it was put after, and after any other new
 * page already placed there. Names come from the framework's own pages, so a new
 * page reads "Operational Security › Passwords" like its neighbours.
 */
function withNewPages(groups: FrameworkGroup[], created: NewPage[]): FrameworkGroup[] {
  if (!created.length) return groups
  return groups.map((g) => {
    const mine = created.filter((n) => n.path.startsWith(`docs/pages/${g.framework}/`))
    if (!mine.length) return g
    const pages = [...g.pages]
    for (const n of mine) {
      const base = toPageEntry(n.path)
      const sibling = pages.find((p) => p.subdir.join('/') === base.subdir.join('/'))
      const entry: PageEntry = {
        ...base,
        title: n.title,
        frameworkTitle: g.title,
        subdirTitles: sibling?.subdirTitles ?? base.subdirTitles,
        isNew: true,
      }
      // First in its section goes before the section's first page.
      const folder = n.path.slice(0, n.path.lastIndexOf('/'))
      const first = pages.findIndex((p) => !p.isNew && p.path.slice(0, p.path.lastIndexOf('/')) === folder)
      let at = n.after ? pages.findIndex((p) => !p.isNew && linkOf(p.path) === n.after) : first - 1
      if (n.after && at < 0) at = pages.length - 1
      while (pages[at + 1]?.isNew) at++
      pages.splice(at + 1, 0, entry)
    }
    return { ...g, pages }
  })
}
