import { describe, expect, it } from 'vitest'
import type { DecisionBundle } from '../queries'
import { coerceSetScore, sanitizeProposals } from './sanitizeProposals'
import type { Proposal } from './proposals'

const bundle: DecisionBundle = {
  decision: { id: 'dec', name: 'TV', createdAt: 0, updatedAt: 0 },
  dimensions: [
    { id: 'genre', decisionId: 'dec', name: 'Genre', kind: 'objective', importance: 3, unit: 'genre' },
    { id: 'feel', decisionId: 'dec', name: 'Feel', kind: 'subjective', importance: 4 },
    { id: 'year', decisionId: 'dec', name: 'Year', kind: 'objective', direction: 'higher', importance: 2, unit: 'year' },
  ],
  options: [
    { id: 'o1', decisionId: 'dec', name: 'The Bear' },
    { id: 'o2', decisionId: 'dec', name: 'Succession' },
  ],
  scores: [],
}

describe('coerceSetScore', () => {
  it('keeps labels on nominal dims even when value is also present', () => {
    const out = coerceSetScore(
      { type: 'setScore', optionId: 'o1', dimensionId: 'genre', value: 1, labels: ['Drama'] },
      bundle.dimensions[0],
    )
    expect(out).toEqual({
      type: 'setScore',
      optionId: 'o1',
      dimensionId: 'genre',
      labels: ['Drama'],
    })
  })

  it('keeps value on rating dims even when labels are also present', () => {
    const out = coerceSetScore(
      { type: 'setScore', optionId: 'o1', dimensionId: 'feel', value: 5, labels: ['Drama'] },
      bundle.dimensions[1],
    )
    expect(out).toEqual({
      type: 'setScore',
      optionId: 'o1',
      dimensionId: 'feel',
      value: 5,
    })
  })

  it('defaults rating to 3 when only labels were proposed', () => {
    const out = coerceSetScore(
      { type: 'setScore', optionId: 'o1', dimensionId: 'feel', labels: ['x'] },
      bundle.dimensions[1],
    )
    expect(out.value).toBe(3)
  })
})

describe('sanitizeProposals', () => {
  it('coerces a mixed batch so Approve is not blocked by scale mismatches', () => {
    const proposals: Proposal[] = [
      { type: 'setScore', optionId: 'o1', dimensionId: 'feel', value: 4, labels: ['oops'] },
      { type: 'setScore', optionId: 'o1', dimensionId: 'genre', value: 1, labels: ['Comedy'] },
      { type: 'setScore', optionId: 'o2', dimensionId: 'year', value: 2018 },
    ]
    const { proposals: out, dropped } = sanitizeProposals(proposals, bundle)
    expect(dropped).toBe(0)
    expect(out).toEqual([
      { type: 'setScore', optionId: 'o1', dimensionId: 'feel', value: 4 },
      { type: 'setScore', optionId: 'o1', dimensionId: 'genre', labels: ['Comedy'] },
      { type: 'setScore', optionId: 'o2', dimensionId: 'year', value: 2018 },
    ])
  })

  it('drops unknown ids and empty genre cells instead of disabling Approve', () => {
    const proposals: Proposal[] = [
      { type: 'setScore', optionId: 'ghost', dimensionId: 'feel', value: 4 },
      { type: 'setScore', optionId: 'o1', dimensionId: 'genre', value: 1 },
      { type: 'setScore', optionId: 'o1', dimensionId: 'feel', value: 5 },
    ]
    const { proposals: out, dropped } = sanitizeProposals(proposals, bundle)
    expect(dropped).toBe(2)
    expect(out).toEqual([{ type: 'setScore', optionId: 'o1', dimensionId: 'feel', value: 5 }])
  })
})
