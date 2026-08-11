import { beforeEach, describe, expect, it } from 'vitest'
import { db } from './db'
import {
  addDimension,
  addOption,
  clearScore,
  createDecision,
  createDecisionSkeleton,
  deleteDecision,
  deleteDimension,
  deleteOption,
  exportDecision,
  importDecision,
  renameDecision,
  setScore,
  updateDimension,
  ValidationError,
} from './mutations'
import { rankOptions } from './scoring'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

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
  const sexiness = await addDimension(decision.id, {
    name: 'Sexiness',
    kind: 'subjective',
    importance: 2,
  })
  const sony = await addOption(decision.id, { name: 'Sony A7C II' })
  const fuji = await addOption(decision.id, { name: 'Fuji X-T5' })
  return { decision, weight, sexiness, sony, fuji }
}

describe('decisions', () => {
  it('creates, renames, rejects empty names', async () => {
    const d = await createDecision('Camera')
    expect(d.id).toBeTruthy()
    expect(d.createdAt).toBeTypeOf('number')
    await renameDecision(d.id, 'Cameras')
    expect((await db.decisions.get(d.id))!.name).toBe('Cameras')
    await expect(createDecision('  ')).rejects.toThrow(ValidationError)
  })

  it('bumps updatedAt on nested mutations', async () => {
    const d = await createDecision('Camera')
    const before = d.updatedAt
    await sleep(2)
    await addDimension(d.id, { name: 'Price', kind: 'subjective', importance: 1 })
    expect((await db.decisions.get(d.id))!.updatedAt).toBeGreaterThan(before)
  })
})

describe('dimension validation', () => {
  it('enforces importance 1..5 integers', async () => {
    const d = await createDecision('X')
    for (const bad of [0, 6, 2.5]) {
      await expect(
        addDimension(d.id, { name: 'p', kind: 'subjective', importance: bad }),
      ).rejects.toThrow(ValidationError)
    }
  })

  it('requires direction for objective, forbids it for subjective', async () => {
    const d = await createDecision('X')
    await expect(
      addDimension(d.id, { name: 'w', kind: 'objective', importance: 1 }),
    ).rejects.toThrow(/direction/)
    await expect(
      addDimension(d.id, { name: 's', kind: 'subjective', direction: 'higher', importance: 1 }),
    ).rejects.toThrow(/direction/)
  })
})

describe('scores', () => {
  it('rejects subjective scores outside integers 1..5 and non-finite values', async () => {
    const { sexiness, sony, weight } = await buildDecision()
    await expect(setScore(sony.id, sexiness.id, 6)).rejects.toThrow(ValidationError)
    await expect(setScore(sony.id, sexiness.id, 2.5)).rejects.toThrow(ValidationError)
    await expect(setScore(sony.id, weight.id, Infinity)).rejects.toThrow(ValidationError)
    await setScore(sony.id, sexiness.id, 3)
    expect(await db.scores.get([sony.id, sexiness.id])).toMatchObject({ value: 3 })
  })

  it('accepts fractional objective values', async () => {
    const { weight, sony } = await buildDecision()
    await setScore(sony.id, weight.id, 429.5)
    expect(await db.scores.get([sony.id, weight.id])).toMatchObject({ value: 429.5 })
  })

  it('upserts: one row per cell', async () => {
    const { weight, sony } = await buildDecision()
    await setScore(sony.id, weight.id, 500)
    await setScore(sony.id, weight.id, 450)
    expect(await db.scores.where('optionId').equals(sony.id).count()).toBe(1)
    expect((await db.scores.get([sony.id, weight.id]))!.value).toBe(450)
  })

  it('rejects cross-decision scores', async () => {
    const { sony } = await buildDecision()
    const other = await createDecision('Other')
    const dim2 = await addDimension(other.id, { name: 'x', kind: 'subjective', importance: 1 })
    await expect(setScore(sony.id, dim2.id, 3)).rejects.toThrow(/different decisions/)
  })

  it('clearScore removes the cell', async () => {
    const { weight, sony } = await buildDecision()
    await setScore(sony.id, weight.id, 500)
    await clearScore(sony.id, weight.id)
    expect(await db.scores.get([sony.id, weight.id])).toBeUndefined()
  })
})

describe('cascades (transactional)', () => {
  it('deleteDimension deletes its scores only', async () => {
    const { weight, sexiness, sony, fuji } = await buildDecision()
    await setScore(sony.id, weight.id, 500)
    await setScore(sony.id, sexiness.id, 4)
    await setScore(fuji.id, weight.id, 400)
    await deleteDimension(weight.id)
    expect(await db.scores.count()).toBe(1)
    expect((await db.scores.toArray())[0]).toMatchObject({ dimensionId: sexiness.id })
  })

  it('deleteOption deletes its scores only', async () => {
    const { weight, sony, fuji } = await buildDecision()
    await setScore(sony.id, weight.id, 500)
    await setScore(fuji.id, weight.id, 400)
    await deleteOption(sony.id)
    const left = await db.scores.toArray()
    expect(left).toHaveLength(1)
    expect(left[0]).toMatchObject({ optionId: fuji.id })
  })

  it('deleteDecision wipes everything under it and nothing else', async () => {
    const { decision, sony, weight } = await buildDecision()
    await setScore(sony.id, weight.id, 500)
    const keeper = await createDecision('Keeper')
    const kdim = await addDimension(keeper.id, { name: 'k', kind: 'subjective', importance: 1 })
    const kopt = await addOption(keeper.id, { name: 'k1' })
    await setScore(kopt.id, kdim.id, 2)

    await deleteDecision(decision.id)
    expect(await db.decisions.count()).toBe(1)
    expect(await db.dimensions.where('decisionId').equals(decision.id).count()).toBe(0)
    expect(await db.options.where('decisionId').equals(decision.id).count()).toBe(0)
    expect(await db.scores.count()).toBe(1) // keeper's score survives
  })
})

describe('updateDimension', () => {
  it('validates the merged result', async () => {
    const { weight } = await buildDecision()
    await expect(updateDimension(weight.id, { importance: 9 })).rejects.toThrow(ValidationError)
    // kind -> subjective without clearing direction must fail
    await expect(updateDimension(weight.id, { kind: 'subjective' })).rejects.toThrow(/direction/)
  })

  it('changing kind wipes that dimension\'s scores', async () => {
    const { weight, sony, fuji } = await buildDecision()
    await setScore(sony.id, weight.id, 500)
    await setScore(fuji.id, weight.id, 400)
    await updateDimension(weight.id, { kind: 'subjective', direction: undefined })
    expect(await db.scores.count()).toBe(0)
    expect((await db.dimensions.get(weight.id))!.kind).toBe('subjective')
  })

  it('patch null clears direction/unit (JSON-safe form used by AI patches)', async () => {
    const { weight, sony } = await buildDecision()
    await setScore(sony.id, weight.id, 500)
    await updateDimension(weight.id, { kind: 'subjective', direction: null })
    const after = await db.dimensions.get(weight.id)
    expect(after!.kind).toBe('subjective')
    expect(after!.direction).toBeUndefined()
    expect(await db.scores.count()).toBe(0)

    const { sexiness } = await buildDecision()
    await updateDimension(sexiness.id, { unit: null })
    expect((await db.dimensions.get(sexiness.id))!.unit).toBeUndefined()
  })
})

describe('export / import', () => {
  it('exports the whole decision', async () => {
    const { decision, sony, weight } = await buildDecision()
    await setScore(sony.id, weight.id, 500)
    const out = await exportDecision(decision.id)
    expect(out.schemaVersion).toBe(1)
    expect(out.decision.id).toBe(decision.id)
    expect(out.dimensions).toHaveLength(2)
    expect(out.options).toHaveLength(2)
    expect(out.scores).toHaveLength(1)
    await expect(exportDecision('missing')).rejects.toThrow(ValidationError)
  })

  it('round-trips: export -> wipe -> import restores everything with fresh ids', async () => {
    const { decision, weight, sexiness, sony, fuji } = await buildDecision()
    await setScore(sony.id, weight.id, 509)
    await setScore(sony.id, sexiness.id, 3)
    await setScore(fuji.id, weight.id, 406)
    await setScore(fuji.id, sexiness.id, 5)

    const before = await exportDecision(decision.id)
    const beforeResults = rankOptions(before.dimensions, before.options, before.scores)

    await deleteDecision(decision.id)
    const newId = await importDecision(before)
    expect(newId).not.toBe(decision.id)

    const after = await exportDecision(newId)
    expect(after.decision.name).toBe('Camera')
    expect(after.dimensions).toHaveLength(2)
    expect(after.options).toHaveLength(2)
    expect(after.scores).toHaveLength(4)
    // fresh ids everywhere, structure preserved
    expect(after.decision.id).not.toBe(before.decision.id)
    expect(new Set(after.dimensions.map((d) => d.id)).size).toBe(2)
    expect(after.dimensions.map((d) => d.name).sort()).toEqual(['Sexiness', 'Weight'])
    const cell = (o: string, d: string) =>
      before.scores.find((s) => s.optionId === o && s.dimensionId === d)?.value
    for (const s of after.scores) {
      const origOpt = before.options.find((x) => after.options.find((o) => o.id === s.optionId)!.name === x.name)!
      const origDim = before.dimensions.find((x) => after.dimensions.find((d) => d.id === s.dimensionId)!.name === x.name)!
      expect(s.value).toBe(cell(origOpt.id, origDim.id))
    }
    const afterResults = rankOptions(after.dimensions, after.options, after.scores)
    expect(afterResults.ranking.map((r) => r.option.name)).toEqual(
      beforeResults.ranking.map((r) => r.option.name),
    )
  })

  it('imports twice without primary-key collisions', async () => {
    const { decision } = await buildDecision()
    const out = await exportDecision(decision.id)
    const a = await importDecision(out)
    const b = await importDecision(out)
    expect(a).not.toBe(b)
    expect(await db.decisions.count()).toBe(3)
  })

  it('rejects malformed payloads', async () => {
    const { decision } = await buildDecision()
    const out = await exportDecision(decision.id)
    await expect(importDecision({ ...out, schemaVersion: 2 } as never)).rejects.toThrow(/schemaVersion/)
    await expect(
      importDecision({ ...out, scores: [{ optionId: 'ghost', dimensionId: out.dimensions[0].id, value: 1 }] }),
    ).rejects.toThrow(/missing from the export/)
    const subj = out.dimensions.find((d) => d.kind === 'subjective')!
    await expect(
      importDecision({
        ...out,
        scores: [{ optionId: out.options[0].id, dimensionId: subj.id, value: 2.5 }],
      }),
    ).rejects.toThrow(/integers 1\.\.5/)
  })
})

describe('createDecisionSkeleton (Phase-7 ramble path)', () => {
  it('creates decision + dimensions + options under the new decision', async () => {
    const decision = await createDecisionSkeleton({
      name: 'Next camera',
      dimensions: [
        { name: 'Weight', kind: 'objective', direction: 'lower', importance: 4, unit: 'g' },
        { name: 'Sexiness', kind: 'subjective', importance: 2 },
      ],
      options: [{ name: 'Sony A7C II' }, { name: 'Fuji X-T5', notes: 'aps-c' }],
    })
    expect((await db.decisions.get(decision.id))!.name).toBe('Next camera')
    const dimensions = await db.dimensions.where('decisionId').equals(decision.id).toArray()
    expect(dimensions.map((d) => d.name).sort()).toEqual(['Sexiness', 'Weight'])
    expect(dimensions.find((d) => d.name === 'Sexiness')!.direction).toBeUndefined()
    const options = await db.options.where('decisionId').equals(decision.id).toArray()
    expect(options.map((o) => o.name).sort()).toEqual(['Fuji X-T5', 'Sony A7C II'])
  })

  it('accepts a name-only skeleton', async () => {
    const decision = await createDecisionSkeleton({ name: 'Bare', dimensions: [], options: [] })
    expect(await db.dimensions.where('decisionId').equals(decision.id).count()).toBe(0)
    expect(await db.options.where('decisionId').equals(decision.id).count()).toBe(0)
  })

  it('writes nothing when any row is invalid (all-or-nothing)', async () => {
    await expect(
      createDecisionSkeleton({
        name: 'Broken',
        dimensions: [
          { name: 'Weight', kind: 'objective', direction: 'lower', importance: 3 },
          { name: 'Bad', kind: 'objective', importance: 3 }, // missing direction
        ],
        options: [{ name: 'A' }],
      }),
    ).rejects.toThrow(ValidationError)
    expect(await db.decisions.count()).toBe(0)
    expect(await db.dimensions.count()).toBe(0)
    expect(await db.options.count()).toBe(0)
  })
})
