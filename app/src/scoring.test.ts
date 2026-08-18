import { describe, expect, it } from 'vitest'
import {
  NEAR_TIE_MARGIN,
  breakEvenProbes,
  dropOneProbes,
  normalizeObjective,
  rankOptions,
  subjectiveScore,
} from './scoring'
import type { Dimension, Option, Score } from './types'

const dim = (over: Partial<Dimension>): Dimension => ({
  id: 'd',
  decisionId: 'dec',
  name: 'dim',
  kind: 'objective',
  direction: 'higher',
  importance: 1,
  ...over,
})
const opt = (id: string, name = id): Option => ({
  id,
  decisionId: 'dec',
  name,
})

describe('normalizeObjective', () => {
  it('normalizes across the option set (higher better)', () => {
    expect(normalizeObjective([10, 20, 30], 'higher')).toEqual([0, 0.5, 1])
  })

  it('inverts for lower-better', () => {
    expect(normalizeObjective([10, 20, 30], 'lower')).toEqual([1, 0.5, 0])
  })

  it('maps all-equal values to 1', () => {
    expect(normalizeObjective([7, 7, 7], 'higher')).toEqual([1, 1, 1])
    expect(normalizeObjective([7, 7], 'lower')).toEqual([1, 1])
  })

  it('handles the empty set', () => {
    expect(normalizeObjective([], 'higher')).toEqual([])
  })
})

describe('subjectiveScore', () => {
  it('maps a 1–5 rating via (r − 1) / 4', () => {
    expect(subjectiveScore(1)).toBe(0)
    expect(subjectiveScore(3)).toBe(0.5)
    expect(subjectiveScore(5)).toBe(1)
    expect(subjectiveScore(2)).toBeCloseTo(0.25)
  })
})

describe('rankOptions — full-matrix rule', () => {
  const d = dim({ id: 'd1' })
  const [a, b] = [opt('a'), opt('b')]

  it('withholds results until every cell is scored, showing progress', () => {
    const r = rankOptions([d], [a, b], [{ optionId: 'a', dimensionId: 'd1', value: 1 }])
    expect(r.complete).toBe(false)
    expect(r.scoredCells).toBe(1)
    expect(r.totalCells).toBe(2)
    expect(r.ranking).toEqual([])
    expect(r.winner).toBeUndefined()
  })

  it('never ranks an empty decision', () => {
    expect(rankOptions([], [], []).complete).toBe(false)
    expect(rankOptions([d], [], []).complete).toBe(false)
    expect(rankOptions([], [a], []).complete).toBe(false)
  })
})

describe('rankOptions — totals', () => {
  it('computes Σ(importance × score) / Σ(importance) with renormalized weights', () => {
    // d1 importance 1 (objective), d2 importance 5 (subjective): weights sum 6.
    const d1 = dim({ id: 'd1', importance: 1 })
    const d2 = dim({ id: 'd2', kind: 'subjective', direction: undefined, importance: 5 })
    const [a, b] = [opt('a'), opt('b')]
    const scores: Score[] = [
      { optionId: 'a', dimensionId: 'd1', value: 10 }, // A best on d1
      { optionId: 'b', dimensionId: 'd1', value: 0 },
      { optionId: 'a', dimensionId: 'd2', value: 1 }, // B best on d2
      { optionId: 'b', dimensionId: 'd2', value: 5 },
    ]
    const r = rankOptions([d1, d2], [a, b], scores)
    expect(r.complete).toBe(true)
    const totals = Object.fromEntries(r.ranking.map((x) => [x.option.id, x.total]))
    expect(totals.a).toBeCloseTo(1 / 6) // (1×1 + 5×0) / 6
    expect(totals.b).toBeCloseTo(5 / 6) // (1×0 + 5×1) / 6
    expect(r.winner?.option.id).toBe('b')
  })

  it('keeps raw values alongside normalized scores', () => {
    const d1 = dim({ id: 'd1', direction: 'lower', unit: 'g' })
    const r = rankOptions(
      [d1],
      [opt('a'), opt('b')],
      [
        { optionId: 'a', dimensionId: 'd1', value: 450 },
        { optionId: 'b', dimensionId: 'd1', value: 600 },
      ],
    )
    const a = r.ranking.find((x) => x.option.id === 'a')!
    expect(a.cells.d1).toEqual({ raw: 450, normalized: 1 })
  })

  it('ranks lower-better objective dimensions correctly', () => {
    const price = dim({ id: 'price', name: 'price', direction: 'lower', unit: '€' })
    const r = rankOptions(
      [price],
      [opt('cheap'), opt('dear')],
      [
        { optionId: 'cheap', dimensionId: 'price', value: 300 },
        { optionId: 'dear', dimensionId: 'price', value: 900 },
      ],
    )
    expect(r.winner?.option.id).toBe('cheap')
    expect(r.ranking.map((x) => x.option.id)).toEqual(['cheap', 'dear'])
  })
})

describe('rankOptions — winner margin and near-tie', () => {
  const d1 = dim({ id: 'd1' })

  it('reports the margin between winner and runner-up', () => {
    const r = rankOptions(
      [d1],
      [opt('a'), opt('b'), opt('c')],
      [
        { optionId: 'a', dimensionId: 'd1', value: 100 },
        { optionId: 'b', dimensionId: 'd1', value: 50 },
        { optionId: 'c', dimensionId: 'd1', value: 0 },
      ],
    )
    expect(r.margin).toBeCloseTo(0.5)
    expect(r.nearTie).toBe(false)
  })

  it(`flags margins ≤ ${NEAR_TIE_MARGIN} as effectively tied`, () => {
    const scoresFor = (bRaw: number): Score[] => [
      { optionId: 'a', dimensionId: 'd1', value: 100 },
      { optionId: 'b', dimensionId: 'd1', value: bRaw },
      { optionId: 'c', dimensionId: 'd1', value: 0 },
    ]
    const exactlyAt = rankOptions([d1], [opt('a'), opt('b'), opt('c')], scoresFor(98))
    expect(exactlyAt.margin).toBeCloseTo(0.02)
    expect(exactlyAt.nearTie).toBe(true)

    const clearWin = rankOptions([d1], [opt('a'), opt('b'), opt('c')], scoresFor(97))
    expect(clearWin.nearTie).toBe(false)
  })

  it('leaves margin undefined with a single option', () => {
    const r = rankOptions([d1], [opt('solo')], [{ optionId: 'solo', dimensionId: 'd1', value: 1 }])
    expect(r.winner?.option.id).toBe('solo')
    expect(r.margin).toBeUndefined()
    expect(r.nearTie).toBe(false)
  })
})

describe('rankOptions — non-discriminating dimensions', () => {
  it('calls out objective dimensions where every option is equal', () => {
    const d1 = dim({ id: 'd1' })
    const r = rankOptions(
      [d1],
      [opt('a'), opt('b')],
      [
        { optionId: 'a', dimensionId: 'd1', value: 120 },
        { optionId: 'b', dimensionId: 'd1', value: 120 },
      ],
    )
    expect(r.nonDiscriminating.map((d) => d.id)).toEqual(['d1'])
    expect(r.nearTie).toBe(true)
  })

  it('calls out subjective dimensions with identical ratings', () => {
    const d1 = dim({ id: 'd1', kind: 'subjective', direction: undefined })
    const r = rankOptions(
      [d1],
      [opt('a'), opt('b')],
      [
        { optionId: 'a', dimensionId: 'd1', value: 4 },
        { optionId: 'b', dimensionId: 'd1', value: 4 },
      ],
    )
    expect(r.nonDiscriminating.map((d) => d.id)).toEqual(['d1'])
  })

  it('does not flag discriminating dimensions', () => {
    const d1 = dim({ id: 'd1' })
    const r = rankOptions(
      [d1],
      [opt('a'), opt('b')],
      [
        { optionId: 'a', dimensionId: 'd1', value: 1 },
        { optionId: 'b', dimensionId: 'd1', value: 2 },
      ],
    )
    expect(r.nonDiscriminating).toEqual([])
  })
})

describe('sensitivity — break-even importance', () => {
  // d1 favors A, d2 (importance 5) favors B; B wins 5/6 vs 1/6.
  const d1 = dim({ id: 'd1', importance: 1 })
  const d2 = dim({ id: 'd2', importance: 5 })
  const [a, b] = [opt('a'), opt('b')]
  const scores: Score[] = [
    { optionId: 'a', dimensionId: 'd1', value: 10 },
    { optionId: 'b', dimensionId: 'd1', value: 0 },
    { optionId: 'a', dimensionId: 'd2', value: 0 },
    { optionId: 'b', dimensionId: 'd2', value: 10 },
  ]

  it('finds the smallest importance at which the challenger leads', () => {
    // A on d1: A(w) = w/(w+5) ≥ B(w) = 5/(w+5) first holds at w = 5 (a tie).
    expect(breakEvenProbes([d1, d2], [a, b], scores)).toEqual([
      { optionId: 'a', dimensionId: 'd1', importanceNeeded: 5 },
    ])
  })

  it('requires leading the whole field, not just catching the winner', () => {
    // d1 raw 8/10/0 favors b over a over c; d2 makes c the winner. Raising
    // d1's importance can never put a ahead of b, so a gets no probe even
    // though it closes on c; b takes the field at importance 2.
    const w1 = dim({ id: 'd1', importance: 1 })
    const w2 = dim({ id: 'd2', importance: 2 })
    const [x, y, z] = [opt('a'), opt('b'), opt('c')]
    const s: Score[] = [
      { optionId: 'a', dimensionId: 'd1', value: 8 },
      { optionId: 'b', dimensionId: 'd1', value: 10 },
      { optionId: 'c', dimensionId: 'd1', value: 0 },
      { optionId: 'a', dimensionId: 'd2', value: 0 },
      { optionId: 'b', dimensionId: 'd2', value: 0 },
      { optionId: 'c', dimensionId: 'd2', value: 10 },
    ]
    expect(breakEvenProbes([w1, w2], [x, y, z], s)).toEqual([
      { optionId: 'b', dimensionId: 'd1', importanceNeeded: 2 },
    ])
  })

  it('stays silent without results', () => {
    expect(breakEvenProbes([d1], [a], [{ optionId: 'a', dimensionId: 'd1', value: 1 }])).toEqual([])
    expect(breakEvenProbes([d1], [a, b], [{ optionId: 'a', dimensionId: 'd1', value: 1 }])).toEqual([])
  })
})

describe('sensitivity — drop-one-dimension', () => {
  it('flags dimensions whose removal flips the winner', () => {
    const d1 = dim({ id: 'd1', importance: 1 })
    const d2 = dim({ id: 'd2', importance: 5 })
    const [a, b] = [opt('a'), opt('b')]
    const scores: Score[] = [
      { optionId: 'a', dimensionId: 'd1', value: 10 },
      { optionId: 'b', dimensionId: 'd1', value: 0 },
      { optionId: 'a', dimensionId: 'd2', value: 0 },
      { optionId: 'b', dimensionId: 'd2', value: 10 },
    ]
    // B wins overall; drop d2 and only A-favoring d1 remains.
    expect(dropOneProbes([d1, d2], [a, b], scores)).toEqual([
      { dimensionId: 'd2', newWinnerId: 'a' },
    ])
  })

  it('stays silent without results or with a single dimension', () => {
    const d1 = dim({ id: 'd1' })
    const [a, b] = [opt('a'), opt('b')]
    expect(
      dropOneProbes([d1], [a, b], [
        { optionId: 'a', dimensionId: 'd1', value: 1 },
        { optionId: 'b', dimensionId: 'd1', value: 0 },
      ]),
    ).toEqual([])
    expect(dropOneProbes([d1, dim({ id: 'd2' })], [a, b], [])).toEqual([])
  })
})

describe('rankOptions — nominal (categorical) dimensions', () => {
  it('requires labels to count as scored and excludes them from the total', () => {
    const price = dim({ id: 'price', name: 'Price', direction: 'lower', importance: 5, unit: '€' })
    const genre = dim({
      id: 'genre',
      name: 'Genre',
      direction: undefined,
      importance: 4,
      unit: 'genre',
    })
    const [a, b] = [opt('a', 'Show A'), opt('b', 'Show B')]
    const incomplete = rankOptions(
      [price, genre],
      [a, b],
      [
        { optionId: 'a', dimensionId: 'price', value: 10 },
        { optionId: 'b', dimensionId: 'price', value: 20 },
        { optionId: 'a', dimensionId: 'genre', labels: ['Drama'] },
      ],
    )
    expect(incomplete.complete).toBe(false)
    expect(incomplete.scoredCells).toBe(3)

    const complete = rankOptions(
      [price, genre],
      [a, b],
      [
        { optionId: 'a', dimensionId: 'price', value: 10 },
        { optionId: 'b', dimensionId: 'price', value: 20 },
        { optionId: 'a', dimensionId: 'genre', labels: ['Drama'] },
        { optionId: 'b', dimensionId: 'genre', labels: ['Comedy', 'Drama'] },
      ],
    )
    expect(complete.complete).toBe(true)
    expect(complete.categorical.map((d) => d.id)).toEqual(['genre'])
    // Lower price wins; genre labels do not flip it.
    expect(complete.winner!.option.id).toBe('a')
    expect(complete.winner!.cells.genre.labels).toEqual(['Drama'])
    expect(complete.ranking[1].cells.genre.labels).toEqual(['Comedy', 'Drama'])
  })
})
