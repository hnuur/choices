// applyProposals: approved cards go through the mutation layer exactly as
// proposed (or user-edited); semantics the parser cannot check live here.

import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../db'
import { addDimension, addOption, createDecision, setScore } from '../mutations'
import { queryDecision } from '../queries'
import { applyDecisionSkeleton, applyProposals } from './apply'
import type { Proposal } from './proposals'

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
})

async function buildDecision() {
  const decision = await createDecision('Camera')
  const weight = await addDimension(decision.id, {
    name: 'Weight',
    kind: 'objective',
    direction: 'lower',
    importance: 3,
    unit: 'g',
  })
  const feel = await addDimension(decision.id, {
    name: 'Feel',
    kind: 'subjective',
    importance: 2,
  })
  const sony = await addOption(decision.id, { name: 'Sony A7C II' })
  const fuji = await addOption(decision.id, { name: 'Fuji X-T5' })
  return { decision, weight, feel, sony, fuji }
}

describe('applyProposals', () => {
  it('applies exactly the card contents through the mutation layer', async () => {
    const { decision, weight, sony } = await buildDecision()
    const proposals: Proposal[] = [
      { type: 'addDimension', dimension: { name: 'Price', kind: 'objective', direction: 'lower', importance: 4, unit: '€' } },
      { type: 'addOption', option: { name: 'Nikon Zf' } },
      { type: 'setScore', optionId: sony.id, dimensionId: weight.id, value: 514 },
      { type: 'updateDimension', id: weight.id, patch: { importance: 5 } },
    ]
    const outcomes = await applyProposals(decision.id, proposals)
    expect(outcomes.every((o) => o.ok)).toBe(true)

    const bundle = await queryDecision(decision.id)
    expect(bundle!.dimensions.map((d) => d.name).sort()).toEqual(['Feel', 'Price', 'Weight'])
    expect(bundle!.options).toHaveLength(3)
    expect(bundle!.scores).toEqual([{ optionId: sony.id, dimensionId: weight.id, value: 514 }])
    expect(bundle!.dimensions.find((d) => d.id === weight.id)!.importance).toBe(5)
  })

  it('applies subjective 1–5 scores through the mutation layer', async () => {
    const { decision, feel, sony } = await buildDecision()
    const outcomes = await applyProposals(decision.id, [
      { type: 'setScore', optionId: sony.id, dimensionId: feel.id, value: 4 },
    ])
    expect(outcomes[0].ok).toBe(true)
    const bundle = await queryDecision(decision.id)
    expect(bundle!.scores).toEqual([{ optionId: sony.id, dimensionId: feel.id, value: 4 }])
  })

  it('rejects subjective scores outside integers 1–5', async () => {
    const { decision, feel, sony } = await buildDecision()
    const outcomes = await applyProposals(decision.id, [
      { type: 'setScore', optionId: sony.id, dimensionId: feel.id, value: 6 },
    ])
    expect(outcomes[0].ok).toBe(false)
    expect(outcomes[0].error).toMatch(/1\.\.5/)
    const bundle = await queryDecision(decision.id)
    expect(bundle!.scores).toHaveLength(0)
  })

  it('rejects ids from another decision', async () => {
    const { decision } = await buildDecision()
    const other = await createDecision('Laptop')
    const otherDim = await addDimension(other.id, {
      name: 'Battery',
      kind: 'objective',
      direction: 'higher',
      importance: 3,
    })
    const outcomes = await applyProposals(decision.id, [
      { type: 'deleteDimension', id: otherDim.id },
      { type: 'setScore', optionId: 'ghost', dimensionId: otherDim.id, value: 1 },
    ])
    expect(outcomes.every((o) => !o.ok)).toBe(true)
    expect(outcomes.every((o) => o.error!.includes('not in this decision'))).toBe(true)
  })

  it('a failing row does not block the rest of the card', async () => {
    const { decision, weight, sony, fuji } = await buildDecision()
    await setScore(sony.id, weight.id, 514)
    const outcomes = await applyProposals(decision.id, [
      { type: 'setScore', optionId: fuji.id, dimensionId: weight.id, value: 557 },
      { type: 'deleteOption', id: 'ghost' },
      { type: 'addOption', option: { name: 'Nikon Zf' } },
    ])
    expect(outcomes.map((o) => o.ok)).toEqual([true, false, true])
    const bundle = await queryDecision(decision.id)
    expect(bundle!.options).toHaveLength(3)
    expect(bundle!.scores).toHaveLength(2)
  })

  it('deletes cascade through the mutation layer', async () => {
    const { decision, weight, sony } = await buildDecision()
    await setScore(sony.id, weight.id, 514)
    const outcomes = await applyProposals(decision.id, [
      { type: 'deleteDimension', id: weight.id },
    ])
    expect(outcomes[0].ok).toBe(true)
    const bundle = await queryDecision(decision.id)
    expect(bundle!.scores).toHaveLength(0)
  })

  it('refuses createDecision inside a decision-bound card (ramble scope only)', async () => {
    const { decision } = await buildDecision()
    const outcomes = await applyProposals(decision.id, [
      { type: 'createDecision', decision: { name: 'Intruder', dimensions: [], options: [] } },
    ])
    expect(outcomes[0].ok).toBe(false)
    expect(outcomes[0].error).toMatch(/only.*ramble/)
    expect(await db.decisions.count()).toBe(1)
  })
})

describe('applyDecisionSkeleton (Phase-7 ramble path)', () => {
  it('creates the approved skeleton through the mutation layer', async () => {
    const decision = await applyDecisionSkeleton({
      name: 'Next camera',
      dimensions: [{ name: 'Weight', kind: 'objective', direction: 'lower', importance: 4, unit: 'g' }],
      options: [{ name: 'Sony A7C II' }, { name: 'Fuji X-T5' }],
    })
    const bundle = await queryDecision(decision.id)
    expect(bundle!.decision.name).toBe('Next camera')
    expect(bundle!.dimensions).toHaveLength(1)
    expect(bundle!.options).toHaveLength(2)
    expect(bundle!.scores).toHaveLength(0)
  })

  it('rejects invalid skeletons and writes nothing', async () => {
    await expect(
      applyDecisionSkeleton({
        name: '  ',
        dimensions: [],
        options: [],
      }),
    ).rejects.toThrow(/name/)
    expect(await db.decisions.count()).toBe(0)
  })
})
