import { useLayoutEffect, useRef, type CSSProperties, type ReactNode } from 'react'
import { useBodyScrollLock, useVisualViewportBox } from './useVisualViewportBox'

/**
 * Keep the modal inside the visual viewport, including while iOS animates
 * the keyboard. CSS presents it as an inset sheet where the window allows.
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
  useLayoutEffect(() => {
    dialogRef.current?.querySelector<HTMLElement>('[data-sheet-title]')?.focus({ preventScroll: true })
  }, [label])

  const style: CSSProperties = {
    ['--sheet-top' as string]: `${top}px`,
    ['--sheet-height' as string]: height ? `${height}px` : '100dvh',
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
      data-keyboard-open={keyboardOpen || top > 0 ? '' : undefined}
      className="sheet-shell fixed inset-x-0 bottom-auto my-0 max-h-none max-w-none flex-col overflow-hidden bg-bg text-ink open:flex"
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
