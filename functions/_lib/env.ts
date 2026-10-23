// The bindings the backend expects: three Worker secrets, and two plain vars
// from `vars` in wrangler.jsonc.
//
// Naming them is the one thing types genuinely buy this layer: `env` is
// otherwise an untyped bag, and a misspelled `env.GITHUB_CLIENT_SECERT` reads
// as `undefined` at runtime rather than failing at the keyboard. `missingEnv`
// still checks at runtime — a type can't tell you whether the secret was
// actually configured on the deploy, only that the code asked for the right
// name.
export interface Env {
  GITHUB_CLIENT_ID: string
  GITHUB_CLIENT_SECRET: string
  /** Long random string; derives both the HMAC and AES-GCM keys. */
  SESSION_SECRET: string
  /** `owner/name` of the docs repo that suggestions are sent to. */
  UPSTREAM_REPO: string
  /** The GitHub App's slug, for its install link. */
  APP_SLUG: string
}

/** What `index.ts` hands each handler. */
export interface Ctx {
  request: Request
  env: Env
}

/** The path the app is served under, on every domain it's deployed to. Keep in
 *  sync with `base` in vite.config.js and the routes in wrangler.jsonc. */
export const BASE_PATH = '/wizard'

/** The upstream branch suggestions target. Keep in sync with BRANCH in
 *  src/lib/github.ts. */
export const BRANCH = 'develop'
