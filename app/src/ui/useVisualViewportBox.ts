import { useEffect, useState } from 'react'

export interface VisualViewportBox {
  /** Offset of the visual viewport from the layout viewport top (iOS keyboard). */
  top: number
  height: number | undefined
  keyboardOpen: boolean
}

export function measureViewport(
  layoutHeight: number,
  viewport?: Pick<VisualViewport, 'offsetTop' | 'height' | 'scale'> | null,
): VisualViewportBox {
  // Keep the original layout while the user pinches or pans around it.
  if (!viewport || Math.abs(viewport.scale - 1) > 0.01 || viewport.height <= 0) {
    return { top: 0, height: undefined, keyboardOpen: false }
  }
  const height = Math.min(layoutHeight, viewport.height)
  return {
    top: Math.max(0, viewport.offsetTop),
    height,
    keyboardOpen: layoutHeight - height > 80,
  }
}

const readViewport = () => measureViewport(window.innerHeight, window.visualViewport)

/**
 * Tracks the visible viewport so fixed fullscreen sheets stay above the iOS
 * keyboard. Without this, focusing an input scrolls the layout viewport and
 * the sheet's header/compose leave the screen (black void + keyboard only).
 */
export function useVisualViewportBox(): VisualViewportBox {
  const [box, setBox] = useState(readViewport)

  useEffect(() => {
    let frame = 0
    let focusTimer = 0
    const update = () => {
      frame = 0
      const next = readViewport()
      setBox((previous) =>
        previous.top === next.top && previous.height === next.height &&
        previous.keyboardOpen === next.keyboardOpen ? previous : next,
      )
    }
    const scheduleUpdate = () => {
      if (!frame) frame = window.requestAnimationFrame(update)
    }
    update()

    const vv = window.visualViewport
    vv?.addEventListener('resize', scheduleUpdate)
    vv?.addEventListener('scroll', scheduleUpdate)
    window.addEventListener('resize', scheduleUpdate)
    // Re-read after the keyboard animation settles in iPadOS Safari.
    const focusKick = () => {
      scheduleUpdate()
      window.clearTimeout(focusTimer)
      focusTimer = window.setTimeout(scheduleUpdate, 300)
    }
    window.addEventListener('focusin', focusKick)
    window.addEventListener('focusout', focusKick)

    return () => {
      window.cancelAnimationFrame(frame)
      window.clearTimeout(focusTimer)
      vv?.removeEventListener('resize', scheduleUpdate)
      vv?.removeEventListener('scroll', scheduleUpdate)
      window.removeEventListener('resize', scheduleUpdate)
      window.removeEventListener('focusin', focusKick)
      window.removeEventListener('focusout', focusKick)
    }
  }, [])

  return box
}

/** Freeze document scroll while a sheet owns the screen (stops iOS jump-scroll). */
export function useBodyScrollLock(locked: boolean): void {
  useEffect(() => {
    if (!locked || typeof document === 'undefined') return
    const { body, documentElement } = document
    const { overflow, position, top, left, right } = body.style
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
      Object.assign(body.style, { overflow, position, top, left, right })
      documentElement.style.overflow = prevHtml
      window.scrollTo(0, scrollY)
    }
  }, [locked])
}
