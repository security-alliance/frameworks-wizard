import { useCallback, useEffect, useState } from 'react'
import type { AuthState, AuthStatus, AuthUser } from './types.js'

// Shared sign-in state, so the header avatar and the Connect step read from one
// source instead of polling separately.
//
// The browser never receives a GitHub token. It only asks our backend who is
// signed in (GET /wizard/api/auth/me) and starts the flow by navigating to
// GET /wizard/api/auth/login. All token handling stays server-side.

/** The auth endpoints, under the base path the app is built for. */
export const AUTH_API = `${import.meta.env.BASE_URL}api/auth`

export function useAuth(): AuthState {
  const [state, setState] = useState<{ status: AuthStatus; user?: AuthUser }>({
    status: 'loading',
  })

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`${AUTH_API}/me`, { credentials: 'same-origin' })
      if (!res.ok) return setState({ status: 'unavailable' })
      const data = (await res.json()) as AuthUser
      setState({ status: data.authenticated ? 'in' : 'out', user: data })
    } catch {
      // No backend (e.g. plain `vite dev`) — auth just isn't available here.
      setState({ status: 'unavailable' })
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const signOut = useCallback(async () => {
    try {
      await fetch(`${AUTH_API}/logout`, {
        method: 'POST',
        credentials: 'same-origin',
      })
    } finally {
      refresh()
    }
  }, [refresh])

  return { ...state, refresh, signOut }
}
