import { describe, expect, it } from 'vitest'
import { speechEndDetector, voiceReviewCommand } from './voiceCapture'

describe('hands-free pause detection', () => {
  it('discards a quiet window even when it contains a short noise', () => {
    const detect = speechEndDetector(0)
    expect(detect(0.03, 200)).toBeUndefined()
    expect(detect(0.001, 250)).toBeUndefined()
    expect(detect(0.001, 12000)).toBe('quiet')
  })

  it('ends a spoken turn only after a pause', () => {
    const detect = speechEndDetector(0)
    detect(0.03, 500)
    detect(0.03, 650)
    expect(detect(0, 1800)).toBeUndefined()
    detect(0.03, 1850)
    expect(detect(0, 3249)).toBeUndefined()
    expect(detect(0, 3250)).toBe('speech')
  })

  it('caps a continuous utterance', () => {
    const detect = speechEndDetector(0)
    detect(0.03, 500)
    detect(0.03, 650)
    expect(detect(0.03, 40500)).toBe('speech')
  })
})

describe('spoken review commands', () => {
  it('recognizes only explicit, standalone commands', () => {
    expect(voiceReviewCommand(' Save changes. ')).toBe('save')
    expect(voiceReviewCommand('Discard changes!')).toBe('discard')
    expect(voiceReviewCommand('Pause listening.')).toBe('pause')
    expect(voiceReviewCommand('Do not save changes.')).toBeUndefined()
    expect(voiceReviewCommand('Yes')).toBeUndefined()
  })
})
