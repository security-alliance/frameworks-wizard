import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
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

// Security headers for the built files, written to dist/_headers, where
// Cloudflare reads them. They're for the files only: the Worker's API answers
// set their own (see functions/_lib/http.ts). The file has to sit at the root
// of the assets folder, one level above the build, so it's written here
// rather than kept in public/.
//
// The Content-Security-Policy says what the page may load and run. Scripts only
// from the wizard itself, plus the inline theme script in index.html, allowed
// by its hash. The hash is taken from the built page, so editing that script
// can't leave a stale one behind. Data only from the wizard and the two GitHub
// hosts pages are read from. Images from anywhere over https, since docs pages
// show images from many sites. Styles allow inline, because the editor sets
// `style` attributes (table widths). No page may show the wizard in a frame.
function securityHeaders() {
  return {
    name: 'security-headers',
    apply: 'build',
    writeBundle(options) {
      const html = readFileSync(`${options.dir}/index.html`, 'utf8')
      const hashes = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(
        ([, code]) => `'sha256-${createHash('sha256').update(code).digest('base64')}'`,
      )
      const csp = [
        "default-src 'self'",
        `script-src 'self' ${hashes.join(' ')}`.trim(),
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: blob: https:",
        "font-src 'self' data:",
        "connect-src 'self' https://api.github.com https://raw.githubusercontent.com",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
        "frame-ancestors 'none'",
      ].join('; ')
      const headers = [
        '/*',
        `  Content-Security-Policy: ${csp}`,
        '  X-Frame-Options: DENY',
        '  X-Content-Type-Options: nosniff',
        '  Referrer-Policy: strict-origin-when-cross-origin',
        '  Permissions-Policy: camera=(), microphone=(), geolocation=()',
        '',
      ].join('\n')
      writeFileSync(new URL('./dist/_headers', import.meta.url), headers)
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), securityHeaders()],
  // Served under /wizard/ next to the docs site. The Worker looks files up by
  // their full path, so the build goes into dist/wizard/ to match. Keep in sync
  // with BASE_PATH in functions/_lib/env.ts.
  base: '/wizard/',
  build: { outDir: 'dist/wizard' },
  define: { __UPSTREAM_REPO__: JSON.stringify(UPSTREAM_REPO) },
})
