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
- **Send**: the note, who will be mentioned, and a live preview of the pull request. Sending opens
  the pull request from the contributor's own fork, under their name (see
  [How sending works](#how-sending-works)).
- **Done**: a link to the pull request, and what happens next.

Not wired up yet: creating new pages.

## Local development

Requires Node 24 (see `.nvmrc`) and pnpm 10.

```bash
pnpm install
pnpm dev        # Vite dev server
pnpm typecheck  # frontend and functions
pnpm build      # typecheck + production build into dist/
```

`pnpm dev` runs the frontend only. Pages are read straight from GitHub's public endpoints, so
everything except signing in and sending works locally. Those need the Worker in `functions/` and
its secrets.

## Deploying (Cloudflare Workers)

The app is one Worker, served at `https://frameworks.securityalliance.org/wizard/`. Cloudflare
serves the built frontend from `dist/` and runs `functions/` for `/wizard/api/*`. The routes in
`wrangler.jsonc` only claim `/wizard` and `/wizard/*`; every other path on the domain still goes to
the docs site. The first deploy creates them.

Deploys run from Cloudflare's Git integration (Workers & Pages → Create → Import a repository),
with:

- **Worker name:** `frameworks-wizard`, matching `name` in `wrangler.jsonc`
- **Build command:** `pnpm build`
- **Deploy command:** `pnpm exec wrangler deploy`

Set these as secrets on the Worker (Settings → Variables and Secrets, type **Secret**):

| Variable               | What it is                                                     |
| ---------------------- | -------------------------------------------------------------- |
| `GITHUB_CLIENT_ID`     | Client ID of the GitHub App used for sign-in                   |
| `GITHUB_CLIENT_SECRET` | That app's client secret                                       |
| `SESSION_SECRET`       | Long random string that encrypts the session cookie; generate one with `openssl rand -hex 32` |

Two plain settings live in `vars` in `wrangler.jsonc` rather than in the dashboard. The build reads
`UPSTREAM_REPO` from there too, so the page picker and the pull requests can't point at different
repos:

| Variable        | What it is                                                                 |
| --------------- | -------------------------------------------------------------------------- |
| `UPSTREAM_REPO` | `security-alliance/frameworks`: where pages are read from and pull requests go |
| `APP_SLUG`      | The GitHub App's slug, the last part of `https://github.com/apps/<slug>`     |

If any of the five is missing, the API endpoints return a 500 rather than half-working.

The app keeps its routes in the URL hash, so no SPA rewrite rule is needed.

## GitHub App

Sign-in and sending both go through one GitHub App, owned by the `security-alliance` organization.

- **Callback URL:** `https://frameworks.securityalliance.org/wizard/api/auth/callback`
- **Expire user authorization tokens:** on. The session ends when the token does, after 8 hours.
- **Request user authorization (OAuth) during installation:** off.
- **Setup URL:** `https://frameworks.securityalliance.org/wizard/`, with **Redirect on update**
  ticked. GitHub sends contributors back here after they install the app on their fork.
- **Webhook:** off.
- **Repository permissions:** Contents and Pull requests set to **Read and write**. Metadata is
  read-only automatically. Everything else, Workflows included, is **No access**.
- **Account permissions:** none. **Events:** none.
- **Where can this GitHub App be installed?** Any account, so contributors can install it on their
  fork.
- **Installed on** `security-alliance`, with only `frameworks` selected, so pull requests can be
  opened there.

The wizard never uses the app's private key. Every call is made with the signed-in contributor's
own token, so the app can only write where it is installed _and_ the contributor has access.

## How sending works

Contributors send from their own fork, like anyone outside the project. The first time, the Send
step walks them through two steps on GitHub's own pages: forking `UPSTREAM_REPO` with the Fork
button, and installing the app on that fork only. After that, pressing Send:

1. Finds their fork through the app's installation on their account.
2. Creates a branch in the fork at the last commit the fork and upstream share, replays the
   contributor's edit onto that commit's version of the page with a three-way merge, and commits it
   as them. The commit goes through GitHub's GraphQL `createCommitOnBranch`, which GitHub signs
   itself, so it shows as Verified.
3. Opens a pull request into `develop` with "Allow edits by maintainers" on.

The app never syncs the fork. A sync that brings in changes to `.github/workflows` needs the
Workflows permission, which the app deliberately doesn't have. Newer changes on `develop` are
combined by GitHub on merge, since `develop` doesn't require branches to be up to date. Only when
the contributor's edit overlaps a change their fork doesn't have yet are they asked to click
**Sync fork** on GitHub themselves.

## Layout

- `src/` is the React frontend.
- `functions/` is the Worker that handles sign-in (`/wizard/api/auth/*`) and sending
  (`/wizard/api/fork`, `/wizard/api/submit`); `index.ts` is its entry.
- `src/components/site/` contains copies of components from the frameworks repo, so the preview
  matches the live site. Keep them in sync with upstream; syncing them automatically is planned.
