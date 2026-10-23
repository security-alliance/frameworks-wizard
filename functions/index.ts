// Worker entry. Cloudflare serves the built frontend in dist/ straight from the
// assets layer; this code only runs for /wizard/api/* (see `run_worker_first`
// in wrangler.jsonc) and for paths that match no file.

import { onRequestGet as login } from './api/auth/login.js'
import { onRequestGet as callback } from './api/auth/callback.js'
import { onRequestGet as me } from './api/auth/me.js'
import { onRequestPost as logout } from './api/auth/logout.js'
import { onRequestGet as fork } from './api/fork.js'
import { onRequestPost as submit } from './api/submit.js'
import { json } from './_lib/http.js'
import { BASE_PATH, type Ctx, type Env } from './_lib/env.js'

type Handler = (ctx: Ctx) => Promise<Response>

const ROUTES: Record<string, Partial<Record<string, Handler>>> = {
  [`${BASE_PATH}/api/auth/login`]: { GET: login },
  [`${BASE_PATH}/api/auth/callback`]: { GET: callback },
  [`${BASE_PATH}/api/auth/me`]: { GET: me },
  [`${BASE_PATH}/api/auth/logout`]: { POST: logout },
  [`${BASE_PATH}/api/fork`]: { GET: fork },
  [`${BASE_PATH}/api/submit`]: { POST: submit },
}

export default {
  async fetch(request, env): Promise<Response> {
    const { pathname } = new URL(request.url)

    const route = ROUTES[pathname]
    if (route) {
      const handler = route[request.method]
      if (handler) return handler({ request, env })
      return json({ error: 'Method not allowed' }, 405, {
        Allow: Object.keys(route).join(', '),
      })
    }

    // On the docs domain only /wizard* reaches this Worker. Run on its own
    // (`wrangler dev`) it also gets `/`, so point that at the app instead of a
    // bare 404.
    if (pathname === '/') return Response.redirect(new URL(`${BASE_PATH}/`, request.url).href, 302)

    return json({ error: 'Not found' }, 404)
  },
} satisfies ExportedHandler<Env>
