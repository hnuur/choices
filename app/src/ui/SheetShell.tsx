import { useLayoutEffect, useRef, type CSSProperties, type ReactNode } from 'react'
import { useBodyScrollLock, useVisualViewportBox } from './useVisualViewportBox'

/**
 * Fullscreen overlay pinned to the visual viewport so iOS keyboard focus
 * cannot scroll the header/compose off-screen.
 */
export default function SheetShell({
  children,
  label,
  onClose,
}: {
  children: ReactNode
  label: string
  onClose: () => void
}) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const { top, height, keyboardOpen } = useVisualViewportBox()
  useBodyScrollLock(true)
  useLayoutEffect(() => {
    const dialog = dialogRef.current!
    dialog.showModal()
    return () => dialog.close()
  }, [])

  const style: CSSProperties = {
    top,
    height: height ?? '100dvh',
    paddingLeft: 'env(safe-area-inset-left)',
    paddingRight: 'env(safe-area-inset-right)',
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
    <dialog
      ref={dialogRef}
      aria-label={label}
      className="fixed inset-x-0 bottom-auto m-0 w-full max-w-none max-h-none flex-col overflow-hidden bg-bg text-ink open:flex"
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
      style={style}
    >
      {children}
    </dialog>
  )
}
