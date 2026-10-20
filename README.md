# Frameworks Contribution Wizard

A web wizard for suggesting changes to the
[SEAL Frameworks](https://frameworks.securityalliance.org) docs
([`security-alliance/frameworks`](https://github.com/security-alliance/frameworks)) without
knowing git. Contributors pick a page, edit it like a document, read their changes back, and send
them as a suggestion for the maintainers to review. It is for people who know the subject and
shouldn't need to learn GitHub to share it.

## Status

Work in progress, not a release.

Works today:

- **Choose** any existing docs page, in the same order as the site's sidebar, or search for one.
- **Write**: edit the page as rich text. Sections the visual editor can't safely rewrite are kept
  read-only, and untouched sections are never re-serialized. Drafts are kept in the browser, so a
  reload doesn't lose work.
- **Check**: the rendered page with additions and removals marked in place, plus a line-by-line diff.
- **Sign in with GitHub**: the token stays server-side, in an encrypted HTTP-only cookie.
- **Send**: the note, who will be mentioned, and a live preview of the pull request.

Not wired up yet: actually opening the pull request (the Send button is disabled), the final
"Done" step, and creating new pages.

## Local development

Requires Node 24 (see `.nvmrc`) and pnpm 10.

```bash
pnpm install
pnpm dev        # Vite dev server
pnpm typecheck  # frontend and functions
pnpm build      # typecheck + production build into dist/
```

`pnpm dev` runs the frontend only. Pages are read straight from GitHub's public endpoints, so
everything except signing in works locally. Sign-in needs the backend in `functions/`; try it on a
Cloudflare Pages preview deployment.

## Deploying (Cloudflare Pages)

Create a Pages project connected to this repo with:

- **Root directory:** `/`
- **Build command:** `pnpm install --frozen-lockfile && pnpm build`
- **Build output directory:** `dist`
- **Node version:** 24, picked up from `.nvmrc`

Set these as secrets on the Pages project:

| Variable               | What it is                                                     |
| ---------------------- | -------------------------------------------------------------- |
| `GITHUB_CLIENT_ID`     | Client ID of the GitHub App used for sign-in                   |
| `GITHUB_CLIENT_SECRET` | That app's client secret                                       |
| `SESSION_SECRET`       | Long random string that encrypts the session cookie; generate one with `openssl rand -hex 32` |

The GitHub App's callback URL must be `https://<your-domain>/api/auth/callback`. If any variable
is missing, the auth endpoints return a 500 rather than half-working.

The app is served from the domain root and keeps its routes in the URL hash, so no SPA rewrite
rule is needed.

## Layout

- `src/` is the React frontend.
- `functions/` holds the Cloudflare Pages Functions for sign-in (`/api/auth/*`).
- `src/components/site/` contains copies of components from the frameworks repo, so the preview
  matches the live site. Keep them in sync with upstream; syncing them automatically is planned.
