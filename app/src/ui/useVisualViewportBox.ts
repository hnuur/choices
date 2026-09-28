import { useEffect, useState } from 'react'

export interface VisualViewportBox {
  /** Offset of the visual viewport from the layout viewport top (iOS keyboard). */
  top: number
  height: number
}

/**
 * Tracks the visible viewport so fixed fullscreen sheets stay above the iOS
 * keyboard. Without this, focusing an input scrolls the layout viewport and
 * the sheet's header/compose leave the screen (black void + keyboard only).
 */
export function useVisualViewportBox(active = true): VisualViewportBox {
  const [box, setBox] = useState<VisualViewportBox>(() => ({
    top: 0,
    height: typeof window !== 'undefined' ? window.innerHeight : 0,
  }))

  useEffect(() => {
    if (!active || typeof window === 'undefined') return

    const read = (): VisualViewportBox => {
      const vv = window.visualViewport
      if (!vv) return { top: 0, height: window.innerHeight }
      return { top: vv.offsetTop, height: vv.height }
    }

    const update = () => setBox(read())
    update()

    const vv = window.visualViewport
    vv?.addEventListener('resize', update)
    vv?.addEventListener('scroll', update)
    window.addEventListener('resize', update)
    // iOS fires orientation / keyboard changes after a frame.
    const focusKick = () => {
      window.requestAnimationFrame(update)
      window.setTimeout(update, 50)
      window.setTimeout(update, 300)
    }
    window.addEventListener('focusin', focusKick)
    window.addEventListener('focusout', focusKick)

    return () => {
      vv?.removeEventListener('resize', update)
      vv?.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
      window.removeEventListener('focusin', focusKick)
      window.removeEventListener('focusout', focusKick)
    }
  }, [active])

  return box
}

/** Freeze document scroll while a sheet owns the screen (stops iOS jump-scroll). */
export function useBodyScrollLock(locked: boolean): void {
  useEffect(() => {
    if (!locked || typeof document === 'undefined') return
    const { body, documentElement } = document
    const prevBody = body.style.overflow
    const prevHtml = documentElement.style.overflow
    const scrollY = window.scrollY
    body.style.overflow = 'hidden'
    documentElement.style.overflow = 'hidden'
    // iOS: pin the body so focus doesn't scroll the layout viewport away.
    body.style.position = 'fixed'
    body.style.top = `-${scrollY}px`
    body.style.left = '0'
    body.style.right = '0'
    return () => {
      body.style.overflow = prevBody
      documentElement.style.overflow = prevHtml
      body.style.position = ''
      body.style.top = ''
      body.style.left = ''
      body.style.right = ''
      window.scrollTo(0, scrollY)
    }
  }, [locked])
}
