// Proposal parser: only well-formed typed mutation payloads pass; malformed
// or unknown shapes are rejected (PLAN.md Phase-6 verify).

import { describe, expect, it } from 'vitest'
import { parseReply, ProposalParseError } from './proposals'

const fence = (json: string) => `Sure thing.\n\`\`\`json\n${json}\n\`\`\``

describe('parseReply', () => {
  it('prose without a JSON block carries no proposals', () => {
    const parsed = parseReply('X won because price dominates.')
    expect(parsed.message).toBe('X won because price dominates.')
    expect(parsed.proposals).toEqual([])
  })

  it('parses every well-formed payload type', () => {
    const parsed = parseReply(
      fence(JSON.stringify({
        message: 'Here you go.',
        proposals: [
          { type: 'addDimension', dimension: { name: 'Weight', kind: 'objective', direction: 'lower', importance: 3, unit: 'g' } },
          { type: 'updateDimension', id: 'd1', patch: { importance: 5 } },
          { type: 'deleteDimension', id: 'd2' },
          { type: 'addOption', option: { name: 'Sony A7C II', notes: 'full frame' } },
          { type: 'deleteOption', id: 'o1' },
          { type: 'setScore', optionId: 'o2', dimensionId: 'd1', value: 514 },
        ],
      })),
    )
    expect(parsed.message).toContain('Here you go.')
    expect(parsed.proposals.map((p) => p.type)).toEqual([
      'addDimension',
      'updateDimension',
      'deleteDimension',
      'addOption',
      'deleteOption',
      'setScore',
    ])
    const add = parsed.proposals[0]
    expect(add.type === 'addDimension' && add.dimension.unit).toBe('g')
  })

  it('accepts a bare array as proposals-only', () => {
    const parsed = parseReply(fence(JSON.stringify([{ type: 'deleteOption', id: 'o1' }])))
    expect(parsed.proposals).toHaveLength(1)
  })

  it('rejects malformed JSON', () => {
    expect(() => parseReply(fence('{oops'))).toThrowError(ProposalParseError)
  })

  it('rejects unknown proposal types', () => {
    expect(() => parseReply(fence(JSON.stringify({ proposals: [{ type: 'dropTable', id: 'x' }] })))).toThrowError(/unknown type/)
  })

  it('rejects unknown fields (strict shapes only)', () => {
    expect(() =>
      parseReply(fence(JSON.stringify({
        proposals: [{ type: 'deleteDimension', id: 'd1', cascade: true }],
      }))),
    ).toThrowError(/unknown field/)
  })

  it('rejects objective dimensions without direction', () => {
    expect(() =>
      parseReply(fence(JSON.stringify({
        proposals: [{ type: 'addDimension', dimension: { name: 'Weight', kind: 'objective', importance: 3 } }],
      }))),
    ).toThrowError(/direction/)
  })

  it('rejects subjective dimensions with direction', () => {
    expect(() =>
      parseReply(fence(JSON.stringify({
        proposals: [{ type: 'addDimension', dimension: { name: 'Feel', kind: 'subjective', direction: 'higher', importance: 3 } }],
      }))),
    ).toThrowError(/no direction/)
  })

  it('rejects out-of-range importance', () => {
    expect(() =>
      parseReply(fence(JSON.stringify({
        proposals: [{ type: 'addDimension', dimension: { name: 'X', kind: 'subjective', importance: 9 } }],
      }))),
    ).toThrowError(/importance/)
  })

  it('accepts Genre without direction and setScore labels', () => {
    const parsed = parseReply(
      fence(JSON.stringify({
        proposals: [
          { type: 'addDimension', dimension: { name: 'Genre', kind: 'objective', importance: 4, unit: 'genre' } },
          { type: 'setScore', optionId: 'o1', dimensionId: 'd1', labels: ['Drama', 'Comedy'] },
        ],
      })),
    )
    const add = parsed.proposals[0]
    expect(add.type === 'addDimension' && add.dimension.direction).toBeUndefined()
    const score = parsed.proposals[1]
    expect(score.type === 'setScore' && score.labels).toEqual(['Drama', 'Comedy'])
  })

  it('rejects setScore with both value and labels', () => {
    expect(() =>
      parseReply(fence(JSON.stringify({
        proposals: [{ type: 'setScore', optionId: 'o', dimensionId: 'd', value: 1, labels: ['x'] }],
      }))),
    ).toThrowError(/exactly one/)
  })

  it('rejects empty patch objects', () => {
    expect(() =>
      parseReply(fence(JSON.stringify({ proposals: [{ type: 'updateDimension', id: 'd1', patch: {} }] }))),
    ).toThrowError(/at least one field/)
  })

  it('accepts null direction/unit in patches (clearing)', () => {
    const parsed = parseReply(
      fence(JSON.stringify({
        proposals: [
          { type: 'updateDimension', id: 'd1', patch: { kind: 'subjective', direction: null } },
          { type: 'updateDimension', id: 'd2', patch: { unit: null } },
        ],
      })),
    )
    expect(parsed.proposals).toHaveLength(2)
    const first = parsed.proposals[0]
    expect(first.type === 'updateDimension' && first.patch.direction).toBeNull()
  })

  it('rejects invalid direction values in patches', () => {
    expect(() =>
      parseReply(fence(JSON.stringify({
        proposals: [{ type: 'updateDimension', id: 'd1', patch: { direction: 'sideways' } }],
      }))),
    ).toThrowError(/direction/)
  })

  it('rejects non-array proposals', () => {
    expect(() => parseReply(fence(JSON.stringify({ proposals: { type: 'deleteOption', id: 'o' } })))).toThrowError(/must be an array/)
  })
})

describe('parseReply — createDecision (Phase-7 ramble payload)', () => {
  const skeleton = (decision: unknown) =>
    fence(JSON.stringify({ message: 'Here is your decision.', proposals: [{ type: 'createDecision', decision }] }))

  it('parses a well-formed whole-decision skeleton', () => {
    const parsed = parseReply(
      skeleton({
        name: 'Next camera',
        dimensions: [
          { name: 'Weight', kind: 'objective', direction: 'lower', importance: 4, unit: 'g' },
          { name: 'Sexiness', kind: 'subjective', importance: 2 },
        ],
        options: [{ name: 'Sony A7C II' }, { name: 'Fuji X-T5', notes: 'aps-c' }],
      }),
    )
    expect(parsed.proposals).toHaveLength(1)
    const p = parsed.proposals[0]
    expect(p.type).toBe('createDecision')
    if (p.type !== 'createDecision') throw new Error('unreachable')
    expect(p.decision.name).toBe('Next camera')
    expect(p.decision.dimensions).toHaveLength(2)
    expect(p.decision.dimensions[0]).toEqual({ name: 'Weight', kind: 'objective', direction: 'lower', importance: 4, unit: 'g' })
    expect(p.decision.options[1]).toEqual({ name: 'Fuji X-T5', notes: 'aps-c' })
  })

  it('parses categorical skeleton scores as labels', () => {
    const parsed = parseReply(
      skeleton({
        name: 'TV night',
        dimensions: [{ name: 'Genre', kind: 'objective', importance: 3, unit: 'genre' }],
        options: [{ name: 'The Bear' }],
        scores: [{ option: 'The Bear', dimension: 'Genre', labels: ['Comedy'] }],
      }),
    )
    const p = parsed.proposals[0]
    expect(p.type === 'createDecision' && p.decision.scores).toEqual([
      { option: 'The Bear', dimension: 'Genre', labels: ['Comedy'] },
    ])
  })

  it('parses best-effort scores keyed by option and dimension name', () => {
    const parsed = parseReply(
      skeleton({
        name: 'Next camera',
        dimensions: [{ name: 'Weight', kind: 'objective', direction: 'lower', importance: 4, unit: 'g' }],
        options: [{ name: 'Sony A7C II' }],
        scores: [{ option: 'Sony A7C II', dimension: 'Weight', value: 514 }],
      }),
    )
    const p = parsed.proposals[0]
    expect(p.type === 'createDecision' && p.decision.scores).toEqual([
      { option: 'Sony A7C II', dimension: 'Weight', value: 514 },
    ])
  })

  it('defaults omitted dimensions/options to empty', () => {
    const parsed = parseReply(skeleton({ name: 'Bare' }))
    const p = parsed.proposals[0]
    expect(p.type === 'createDecision' && p.decision.dimensions).toEqual([])
    expect(p.type === 'createDecision' && p.decision.options).toEqual([])
  })

  it('rejects createDecision without a decision object', () => {
    expect(() => parseReply(fence(JSON.stringify({ proposals: [{ type: 'createDecision' }] })))).toThrowError(/must be an object/)
  })

  it('rejects skeletons without a name', () => {
    expect(() => parseReply(skeleton({ dimensions: [] }))).toThrowError(/name/)
  })

  it('rejects unknown fields on a skeleton score', () => {
    expect(() =>
      parseReply(skeleton({ name: 'X', scores: [{ option: 'A', dimension: 'B', value: 1, extra: true }] })),
    ).toThrowError(/unknown field/)
  })

  it('rejects non-array dimensions in the skeleton', () => {
    expect(() => parseReply(skeleton({ name: 'X', dimensions: { name: 'Weight' } }))).toThrowError(/dimensions must be an array/)
  })

  it('rejects malformed dimension entries inside the skeleton', () => {
    expect(() =>
      parseReply(skeleton({ name: 'X', dimensions: [{ name: 'Weight', kind: 'objective', importance: 9 }] }),
    )).toThrowError(/importance/)
  })

  it('rejects unknown fields on skeleton options', () => {
    expect(() => parseReply(skeleton({ name: 'X', options: [{ name: 'A', price: 1 }] }))).toThrowError(/unknown field/)
  })
})
