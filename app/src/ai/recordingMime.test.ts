import { describe, expect, it } from 'vitest'
import {
  isAppleRecordingEngine,
  pickRecordingMimeType,
  resolveRecordingMimeType,
} from './recordingMime'

describe('recordingMime', () => {
  it('detects Apple engines from the UA', () => {
    expect(isAppleRecordingEngine('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)')).toBe(true)
    expect(isAppleRecordingEngine('Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) Safari/605')).toBe(true)
    expect(isAppleRecordingEngine('Mozilla/5.0 (Linux; Android 14) Chrome/120')).toBe(false)
  })

  it('prefers audio/mp4 on Apple when supported', () => {
    const supported = new Set(['audio/mp4', 'audio/webm'])
    expect(pickRecordingMimeType((t) => supported.has(t), true)).toBe('audio/mp4')
    expect(pickRecordingMimeType((t) => supported.has(t), false)).toBe('audio/webm')
  })

  it('defaults empty recorder mime to mp4 on Apple, webm elsewhere', () => {
    expect(resolveRecordingMimeType('', undefined, undefined, true)).toBe('audio/mp4')
    expect(resolveRecordingMimeType('', undefined, undefined, false)).toBe('audio/webm')
    expect(resolveRecordingMimeType('audio/mp4;codecs=mp4a.40.2', 'audio/webm', undefined, true)).toBe(
      'audio/mp4',
    )
  })
})
