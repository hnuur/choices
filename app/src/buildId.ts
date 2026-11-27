// Network-only build stamp helpers (no service-worker imports — safe for tests).

export const APP_BUILD_ID = import.meta.env.VITE_APP_BUILD_ID || 'dev'

async function clearSiteCaches(): Promise<void> {
  if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
    const regs = await navigator.serviceWorker.getRegistrations()
    await Promise.all(regs.map((r) => r.unregister()))
  }
  if (typeof caches !== 'undefined') {
    const keys = await caches.keys()
    await Promise.all(keys.map((k) => caches.delete(k)))
  }
}

/** Fetch live build.json (bypasses SW precache + CDN via cache-bust). */
export async function fetchLiveBuildId(): Promise<string | null> {
  const url = `${import.meta.env.BASE_URL}build.json?t=${Date.now()}`
  const res = await fetch(url, { cache: 'no-store' })
  if (!res.ok) return null
  const data = (await res.json()) as { id?: unknown }
  return typeof data.id === 'string' && data.id ? data.id : null
}

/**
 * If the installed shell's build id ≠ live build.json, wipe SW/caches and
 * reload so the next load gets the new assets. Returns true when reloading.
 */
export async function reloadIfStaleBuild(): Promise<boolean> {
  try {
    const live = await fetchLiveBuildId()
    if (!live || live === APP_BUILD_ID) return false
    await clearSiteCaches()
    location.reload()
    return true
  } catch {
    // Offline or Pages hiccup — leave the installed shell alone.
    return false
  }
}
