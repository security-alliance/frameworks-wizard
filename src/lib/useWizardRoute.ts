import { useCallback, useEffect, useRef, useState } from 'react'
import { STEPS, stepIndex } from '../wizard/steps.js'

// The wizard's address bar: `#/edit?page=opsec/travel/overview`.
//
// Dropping someone back at the welcome screen on reload is a rough thing to do
// to them four steps into picking a page out of 350. The step and the chosen
// page live in the URL, so a refresh, a bookmark or a pasted link all land
// where they should — and Back/Forward walk the wizard instead of leaving it.
//
// It's in the hash rather than the path on purpose: a hash needs no rewrite rule
// from whatever is serving the built files, so `/…#/review` can't 404 the way
// `/review` would on a static host.
//
// Edits themselves aren't in the URL. They're too big for it, and a link that
// silently carried someone else's half-finished draft would be worse than one
// that doesn't.

const DOCS_ROOT = 'docs/pages/'

interface Route {
  step: number
  path: string
}

export interface WizardRoute extends Route {
  /** Whether `path` is a page the contributor actually landed on, rather than
   *  the fallback this hook was handed.
   *
   *  The default page exists so the editor has something to open for anyone who
   *  skips the picker, but it is not a choice, and treating it as one would
   *  make the stepper report a page had been selected before the wizard had
   *  even been started. Once true it stays true: stepping back to the welcome screen
   *  drops `?page=` from the address, and that isn't unchoosing. */
  chosen: boolean
  /** Set when GitHub's callback reported a failed sign-in. Read once, at
   *  startup, before the parameter is stripped from the address. */
  authError: string | null
  goToStep: (step: number) => void
  goToPage: (path: string) => void
}

const toRoute = (path: string | null | undefined): string | null =>
  path?.startsWith(DOCS_ROOT) ? path.slice(DOCS_ROOT.length).replace(/\.mdx$/, '') : null

const toPath = (route: string | null): string | null =>
  route ? `${DOCS_ROOT}${route}.mdx` : null

function parseHash(hash: string): { step: number | null; path: string | null } {
  const [id, query] = hash.replace(/^#\/?/, '').split('?')
  const step = stepIndex(id)
  return {
    step: step >= 0 ? step : null,
    path: toPath(new URLSearchParams(query).get('page')),
  }
}

// Params GitHub's callback sends us. They report the outcome of one sign-in
// attempt and mean nothing afterwards, so they're read once at startup and then
// dropped from the address — see `stripOAuthParams`.
const OAUTH_PARAMS = ['connected', 'auth_error']

// The landing page keeps a bare address — there's nothing yet to point at — and
// only the steps that are about a chosen page carry `?page=`.
function formatUrl(step: number, path: string): string {
  const base = window.location.pathname + stripOAuthParams(window.location.search)
  const s = STEPS[step]
  if (s.id === 'welcome') return base
  const route = s.page ? toRoute(path) : null
  return `${base}#/${s.id}${route ? `?page=${route}` : ''}`
}

// `?connected=1` is a message about one moment, not a place. Left in the URL it
// would stick: stepping back to Welcome would keep it, and reloading there
// would read it again and bounce the contributor to the sign-in step they had
// just left.
function stripOAuthParams(search: string): string {
  const q = new URLSearchParams(search)
  for (const p of OAUTH_PARAMS) q.delete(p)
  const rest = q.toString()
  return rest ? `?${rest}` : ''
}

/**
 * @param defaultPath page to open when the URL doesn't name one
 */
export function useWizardRoute(defaultPath: string): WizardRoute {
  // Read once, at startup, before the first `replaceState` clears it from the
  // address. Held in state so the Connect step can still show what happened.
  const [authError] = useState<string | null>(
    () => new URLSearchParams(window.location.search).get('auth_error'),
  )

  // A page named in the address was either deep-linked or picked before a
  // reload. Either way it's the contributor's, not ours.
  const [chosen, setChosen] = useState<boolean>(
    () => parseHash(window.location.hash).path !== null,
  )

  const [route, setRoute] = useState<Route>(() => {
    const fromHash = parseHash(window.location.hash)
    // Returning from the GitHub OAuth redirect (?connected=1 / ?auth_error=…)
    // should land on Connect, not wherever the hash last pointed, so the result
    // of signing in is actually visible.
    const q = new URLSearchParams(window.location.search)
    const returning = OAUTH_PARAMS.some((p) => q.has(p))
    return {
      step: returning ? stepIndex('connect') : (fromHash.step ?? 0),
      path: fromHash.path ?? defaultPath,
    }
  })

  // Stamp the URL on first load so a reload from a bare address still works.
  useEffect(() => {
    window.history.replaceState(null, '', formatUrl(route.step, route.path))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Browser Back/Forward. `pushState` doesn't fire either of these itself, so
  // there's no loop back into the navigation below.
  useEffect(() => {
    const sync = () => {
      const next = parseHash(window.location.hash)
      if (next.path) setChosen(true)
      // No hash means the landing page — that's the address welcome is stamped
      // with, so Back out of the first step has to be able to read it.
      setRoute((r) => ({ step: next.step ?? 0, path: next.path ?? r.path }))
    }
    window.addEventListener('popstate', sync)
    window.addEventListener('hashchange', sync)
    return () => {
      window.removeEventListener('popstate', sync)
      window.removeEventListener('hashchange', sync)
    }
  }, [])

  // Navigation reads the current route through a ref rather than a state
  // updater: pushing a history entry is a side effect, and an updater can be run
  // more than once per commit.
  const current = useRef(route)
  current.current = route

  const navigate = useCallback((patch: Partial<Route>, replace?: boolean) => {
    const next = { ...current.current, ...patch }
    current.current = next
    setRoute(next)
    const url = formatUrl(next.step, next.path)
    if (replace) window.history.replaceState(null, '', url)
    else window.history.pushState(null, '', url)
  }, [])

  const goToStep = useCallback(
    (step: number) => navigate({ step: Math.max(0, Math.min(STEPS.length - 1, step)) }),
    [navigate],
  )

  // Choosing a different page replaces the current entry rather than adding one,
  // so Back still means "the previous step" and not "the page I clicked before".
  const goToPage = useCallback(
    (path: string) => {
      setChosen(true)
      navigate({ path }, true)
    },
    [navigate],
  )

  return {
    step: route.step,
    path: route.path,
    chosen,
    authError,
    goToStep,
    goToPage,
  }
}
