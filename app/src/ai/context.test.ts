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
    expect(prompt).toMatch(/never unit:"rating"/)
    expect(rambleSystemPrompt()).toMatch(/Exactly one of value or labels/)
    expect(rambleSystemPrompt()).toMatch(/never unit:"rating"/)
  })

  it('requires setScore proposals when scoring (every tab gets SCORE FILL HARD RULE)', () => {
    const score = systemPrompt('score')
    expect(score).toMatch(/SCORE FILL HARD RULE/)
    expect(score).toMatch(/Proposing IS the action/)
    expect(score).toMatch(/never wait for "do it"/)
    expect(score).toMatch(/Never answer with prose-only per-option writeups/)
    expect(score).toMatch(/snapshot\.unscored/)
    expect(score).toMatch(/open approval card does NOT block/)
    expect(score).toMatch(/snapshot\.unscored is \[\]/)
    expect(score).toMatch(/Status questions only/)
    expect(systemPrompt('options')).toMatch(/SCORE FILL HARD RULE/)
    expect(systemPrompt('results')).toMatch(/SCORE FILL HARD RULE/)
  })

  it('lists unscored cells in the snapshot so fill-all can be counted', () => {
    const bundle: DecisionBundle = {
      decision: { id: 'dec', name: 'Cars', createdAt: 0, updatedAt: 0 },
      dimensions: [
        { id: 'd1', decisionId: 'dec', name: 'Price', kind: 'objective', direction: 'lower', importance: 3, unit: 'USD' },
        { id: 'd2', decisionId: 'dec', name: 'Feel', kind: 'subjective', importance: 4 },
      ],
      options: [
        { id: 'o1', decisionId: 'dec', name: 'Camry' },
        { id: 'o2', decisionId: 'dec', name: 'Accord' },
      ],
      scores: [{ optionId: 'o1', dimensionId: 'd1', value: 28000 }],
    }
    const snap = JSON.parse(decisionSnapshot(bundle)) as {
      unscored: { optionId: string; dimensionId: string; option: string; dimension: string; scale: string }[]
      results: { missingCount: number }
    }
    expect(snap.unscored).toHaveLength(3)
    expect(snap.results.missingCount).toBe(3)
    expect(snap.unscored).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ optionId: 'o1', dimensionId: 'd2', scale: 'rating' }),
        expect.objectContaining({ optionId: 'o2', dimensionId: 'd1', scale: 'numeric' }),
        expect.objectContaining({ optionId: 'o2', dimensionId: 'd2', scale: 'rating' }),
      ]),
    )
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
