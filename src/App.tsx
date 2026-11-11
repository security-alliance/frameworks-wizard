import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  fetchPageList,
  fetchRawPage,
  splitFrontmatter,
  fetchContributors,
  pageTrail,
  toPageEntry,
} from './lib/github.js'
import { parseFrontmatter } from './lib/frontmatter.js'
import { splitBlocks, updateBlock, isDirty, syncChecklistImport } from './lib/blocks.js'
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

  const [groups, setGroups] = useState<FrameworkGroup[]>([])
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

  // (Re)load the selected page whenever the path changes.
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fetchRawPage(path)
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
  }, [path])

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
    { summary: DraftSummary; draft: Draft; suggestion: Suggestion }[]
  >([])

  function discardDraft(target: string) {
    const draft = readDraft(target)
    const summary = drafts.find((d) => d.path === target)
    if (draft && summary) {
      const entry = { summary, draft, suggestion: { note, answers, leftOut } }
      setDiscarded((d) => [...d.filter((x) => x.summary.path !== target), entry])
      setTimeout(() => setDiscarded((d) => d.filter((x) => x !== entry)), 6000)
    }
    clearDraft(target)
    if (target === path) {
      setBlocks(splitBlocks(originalBody))
      setRestored(null)
    }
    forgetSuggestionIfEmpty()
  }

  function undoDiscard(target: string) {
    const entry = discarded.find((x) => x.summary.path === target)
    if (!entry) return
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

  // Once it's sent, the change lives in the pull request, and the drafts sent
  // have done their job. Clearing them is what stops the drafts menu offering
  // to send the same thing twice. Unticked drafts stay, to be sent on their
  // own, but the note described what went out, so it goes.
  function finishSend(result: Sent) {
    for (const p of result.paths) clearDraft(p)
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
