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
  it('hard-rules name + why-good line for prose and options in both prompts', () => {
    for (const prompt of [systemPrompt('options'), rambleSystemPrompt()]) {
      expect(prompt).toMatch(/HARD RULE for places/)
      expect(prompt).toMatch(/Name — one sentence why it is good/)
      expect(prompt).toMatch(/postal\/ZIP/)
      expect(prompt).toMatch(/website\/URL/)
      expect(prompt).toMatch(/star ratings/)
      expect(prompt).toMatch(/Do not paste search-result cards/)
      expect(prompt).toMatch(/no \*\*/)
    }
  })

  it('lookup guidance forbids per-place website citations', () => {
    const prompt = rambleSystemPrompt(true)
    expect(prompt).toMatch(/never cite per-place websites/)
    expect(prompt).not.toMatch(/Cite each source in the prose by name and URL/)
  })
})
