// The bindings the auth backend expects, set as Pages project secrets.
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
}

/** The context a Pages Function handler receives, narrowed to our bindings. */
export type Ctx = EventContext<Env, string, unknown>
