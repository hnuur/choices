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

  it('rejects non-finite score values', () => {
    expect(() =>
      parseReply(fence(JSON.stringify({
        proposals: [{ type: 'setScore', optionId: 'o', dimensionId: 'd', value: 'heavy' }],
      }))),
    ).toThrowError(/finite number/)
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
