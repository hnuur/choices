import { describe, expect, it } from 'vitest'
import { useBodyScrollLock, useVisualViewportBox } from './useVisualViewportBox'

describe('visual viewport box helpers', () => {
  it('exports the hooks SheetShell relies on', () => {
    expect(typeof useVisualViewportBox).toBe('function')
    expect(typeof useBodyScrollLock).toBe('function')
  })
})
