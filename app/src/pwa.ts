// PWA update path: GH Pages caches sw.js (~10 min) and iOS standalone keeps
// the controlling SW across force-quit. A network-only build.json (not
// precached) lets us detect drift and nuke Cache Storage + registrations.

import { registerSW } from 'virtual:pwa-register'
import { reloadIfStaleBuild } from './buildId'

export function registerPwa(): void {
  if (!import.meta.env.PROD) return

  registerSW({
    immediate: true,
    onRegisteredSW(_url, registration) {
      if (!registration) return
      const ping = () => {
        void registration.update()
        void reloadIfStaleBuild()
      }
      // Periodic + foreground checks so iOS standalone eventually notices.
      window.setInterval(ping, 30_000)
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') ping()
      })
      window.addEventListener('pageshow', ping)
      // First check shortly after boot (SW may still be installing).
      window.setTimeout(ping, 2_000)
    },
  })
}
