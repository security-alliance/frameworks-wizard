import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// The docs site's font, served by the wizard itself rather than a font CDN.
// Only the character sets a page actually uses get downloaded.
import '@fontsource-variable/geist'
import './index.css'
import App from './App.js'

const root = document.getElementById('root')
if (!root) throw new Error('No #root element in index.html')

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
