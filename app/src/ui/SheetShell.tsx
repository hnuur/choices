import type { CSSProperties, ReactNode } from 'react'
import { useBodyScrollLock, useVisualViewportBox } from './useVisualViewportBox'

/**
 * Fullscreen overlay pinned to the visual viewport so iOS keyboard focus
 * cannot scroll the header/compose off-screen.
 */
export default function SheetShell({
  children,
  className = '',
}: {
  children: ReactNode
  className?: string
}) {
  const { top, height } = useVisualViewportBox(true)
  useBodyScrollLock(true)
  const layoutH = typeof window !== 'undefined' ? window.innerHeight : height
  const keyboardOpen = height > 0 && layoutH > 0 && height < layoutH - 80
  const style: CSSProperties = {
    top,
    height: height > 0 ? height : undefined,
    maxHeight: height > 0 ? height : '100dvh',
    // When the keyboard has scrolled the visual viewport, skip status-bar /
    // home-indicator padding so header + compose still fit.
    ['--sheet-pad-top' as string]: top > 0 || keyboardOpen
      ? '0.5rem'
      : 'calc(env(safe-area-inset-top) + 0.75rem)',
    ['--sheet-pad-bottom' as string]: keyboardOpen
      ? '0.5rem'
      : 'calc(env(safe-area-inset-bottom) + 0.5rem)',
  }
  return (
    <div
      className={`fixed inset-x-0 z-40 flex flex-col overflow-hidden bg-bg ${className}`}
      style={style}
    >
      {children}
    </div>
  )
}
