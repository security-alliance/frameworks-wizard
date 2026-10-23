import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// The repo pages are read from comes from the Worker's own config, so the page
// picker and the backend that sends suggestions can't point at different repos.
// wrangler.jsonc allows comments, which JSON.parse doesn't, so they're dropped
// first; the string alternative keeps a `//` inside a value from counting.
function wranglerVars() {
  const text = readFileSync(new URL('./wrangler.jsonc', import.meta.url), 'utf8')
  const json = text.replace(
    /("(?:\\.|[^"\\])*")|\/\/[^\n]*|\/\*[\s\S]*?\*\//g,
    (_, str) => str ?? '',
  )
  return JSON.parse(json).vars ?? {}
}

const { UPSTREAM_REPO } = wranglerVars()
if (!UPSTREAM_REPO) throw new Error('wrangler.jsonc has no vars.UPSTREAM_REPO')

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Served under /wizard/ next to the docs site. The Worker looks files up by
  // their full path, so the build goes into dist/wizard/ to match. Keep in sync
  // with BASE_PATH in functions/_lib/env.ts.
  base: '/wizard/',
  build: { outDir: 'dist/wizard' },
  define: { __UPSTREAM_REPO__: JSON.stringify(UPSTREAM_REPO) },
})
