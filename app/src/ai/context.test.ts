import { describe, expect, it } from 'vitest'
import { rambleSystemPrompt, systemPrompt } from './context'

describe('lookup guidance', () => {
  it('is absent when web lookup is off so today\'s prompt is unchanged', () => {
    expect(systemPrompt('score')).not.toMatch(/Web lookup is on/)
    expect(rambleSystemPrompt()).not.toMatch(/Web lookup is on/)
  })

  it('is appended when web lookup is on', () => {
    expect(systemPrompt('score', true)).toMatch(/Web lookup is on/)
    expect(systemPrompt('score', true)).toMatch(/Omit a cell/)
    expect(rambleSystemPrompt(true)).toMatch(/Subjective 1–5 ratings are judgement/)
  })
})
