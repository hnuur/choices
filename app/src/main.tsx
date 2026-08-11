import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Self-hosted so the PWA precache serves them offline (no CDN round-trip).
import '@fontsource/inter-tight/400.css'
import '@fontsource/inter-tight/500.css'
import '@fontsource/inter-tight/600.css'
import '@fontsource/inter-tight/700.css'
import '@fontsource/jetbrains-mono/400.css'
import '@fontsource/jetbrains-mono/500.css'
import '@fontsource/jetbrains-mono/600.css'
import App from './App'
import './index.css'

// iOS evicts non-persisted IndexedDB under storage pressure; ask once at startup.
if (navigator.storage?.persist) {
  void navigator.storage.persist()
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
