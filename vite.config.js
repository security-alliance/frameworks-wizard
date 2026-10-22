import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Served under /wizard/ next to the docs site. The Worker looks files up by
  // their full path, so the build goes into dist/wizard/ to match. Keep in sync
  // with BASE_PATH in functions/_lib/env.ts.
  base: '/wizard/',
  build: { outDir: 'dist/wizard' },
})
