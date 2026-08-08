import { useState } from 'react'

const DISMISS_KEY = 'choices-install-hint-dismissed'

function isIOS(): boolean {
  return (
    /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  )
}

function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    // iOS Safari exposes installed display here, not on matchMedia.
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

/**
 * iOS never fires an install prompt, so the only way to install there is
 * Share → Add to Home Screen; this hint is the prompt. Hidden once installed
 * (standalone) or dismissed.
 */
export default function InstallHint() {
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(DISMISS_KEY) === '1')
  if (dismissed || !isIOS() || isStandalone()) return null
  return (
    <div className="mt-4 flex items-start gap-2 rounded-lg border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900">
      <p className="flex-1">
        Install Choices: open the Share menu and tap{' '}
        <span className="font-medium">Add to Home Screen</span>. The app then
        runs offline and standalone.
      </p>
      <button
        type="button"
        className="shrink-0 text-xs font-medium text-sky-700 hover:text-sky-900"
        onClick={() => {
          localStorage.setItem(DISMISS_KEY, '1')
          setDismissed(true)
        }}
      >
        Dismiss
      </button>
    </div>
  )
}
