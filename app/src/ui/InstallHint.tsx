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
    <div className="mt-3 flex flex-wrap items-start gap-x-2 border-t border-divider pt-3 text-sm text-ink-2">
      <p className="flex-1 basis-36">
        For quick access, open Safari’s Share menu and tap{' '}
        <strong>Add to Home Screen</strong>.
      </p>
      <button
        type="button"
        className="text-action"
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
