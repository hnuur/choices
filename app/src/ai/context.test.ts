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

describe('place option blurbs', () => {
  it('asks for name + why-good blurb only — no address, site, or rating', () => {
    for (const prompt of [systemPrompt('options'), rambleSystemPrompt()]) {
      expect(prompt).toMatch(/place name only/)
      expect(prompt).toMatch(/one-sentence blurb of why it is good/)
      expect(prompt).toMatch(/postal\/ZIP/)
      expect(prompt).toMatch(/website\/URL/)
      expect(prompt).toMatch(/star rating/)
      expect(prompt).not.toMatch(/star\/rating \(if found\)/)
    }
  })

  it('repeats the restraint in lookup guidance when web lookup is on', () => {
    expect(rambleSystemPrompt(true)).toMatch(/Do not include street address/)
  })
})
