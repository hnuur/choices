import { describe, expect, it } from 'vitest'
import { decisionSnapshot, rambleSystemPrompt, systemPrompt } from './context'
import type { DecisionBundle } from '../queries'

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

describe('score contract', () => {
  it('tells the model to copy distinct option ids and emit exactly one of value or labels', () => {
    const prompt = systemPrompt('score')
    expect(prompt).toMatch(/never reuse one option's id/)
    expect(prompt).toMatch(/Exactly one of value or labels/)
    expect(prompt).toMatch(/"nominal"/)
    expect(rambleSystemPrompt()).toMatch(/Exactly one of value or labels/)
  })

  it('requires setScore proposals on the first turn when scoring on the Score tab', () => {
    const score = systemPrompt('score')
    expect(score).toMatch(/SCORE TAB HARD RULE/)
    expect(score).toMatch(/Proposing IS the action/)
    expect(score).toMatch(/never wait for "do it"/)
    expect(score).toMatch(/Never answer with prose-only per-option writeups/)
    expect(systemPrompt('results')).not.toMatch(/SCORE TAB HARD RULE/)
  })

  it('lookup-on score tab still ends with setScore proposals in the same reply', () => {
    expect(systemPrompt('score', true)).toMatch(/research and score/)
    expect(systemPrompt('score', true)).toMatch(/never stop at a research essay/)
  })

  it('labels each snapshot dimension with scale so setScore can match value vs labels', () => {
    const bundle: DecisionBundle = {
      decision: { id: 'dec', name: 'TV night', createdAt: 0, updatedAt: 0 },
      dimensions: [
        { id: 'g', decisionId: 'dec', name: 'Genre', kind: 'objective', importance: 3, unit: 'genre' },
        { id: 'q', decisionId: 'dec', name: 'Quality', kind: 'subjective', importance: 4 },
        { id: 'y', decisionId: 'dec', name: 'Year', kind: 'objective', direction: 'higher', importance: 2, unit: 'year' },
      ],
      options: [
        { id: 'o1', decisionId: 'dec', name: 'The Bear' },
        { id: 'o2', decisionId: 'dec', name: 'The Good Fight' },
      ],
      scores: [],
    }
    const snap = JSON.parse(decisionSnapshot(bundle)) as {
      dimensions: { name: string; scale: string }[]
    }
    expect(snap.dimensions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'Genre', scale: 'nominal' }),
        expect.objectContaining({ name: 'Quality', scale: 'rating' }),
        expect.objectContaining({ name: 'Year', scale: 'numeric' }),
      ]),
    )
  })
})
