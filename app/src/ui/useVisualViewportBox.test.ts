import { describe, expect, it } from 'vitest'
import { measureViewport } from './useVisualViewportBox'

describe('measureViewport', () => {
  it('keeps the sheet inside the shifted viewport above the keyboard', () => {
    expect(measureViewport(1180, { height: 740, offsetTop: 108, scale: 1 })).toEqual({
      top: 108,
      height: 740,
      keyboardOpen: true,
    })
  })

  it('retains safe-area padding after rotation or a Safari rubber-band scroll', () => {
    expect(measureViewport(820, { height: 820, offsetTop: -3, scale: 1 })).toEqual({
      top: 0,
      height: 820,
      keyboardOpen: false,
    })
  })

  it('uses the CSS viewport when pinching or when visual viewport data is absent', () => {
    const fallback = { top: 0, height: undefined, keyboardOpen: false }
    expect(measureViewport(1180, { height: 590, offsetTop: 150, scale: 2 })).toEqual(fallback)
    expect(measureViewport(1180, null)).toEqual(fallback)
  })
})
