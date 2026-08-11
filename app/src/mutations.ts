// Mutation layer per PLAN.md "Product spec": all writes go through these
// typed functions; cascades live here inside transactions, never in the UI.

import { db } from './db'
import { uid } from './uid'
import type {
  Decision,
  DecisionExport,
  DecisionSkeletonInput,
  Dimension,
  DimensionInput,
  Option,
  OptionInput,
  Score,
} from './types'

export class ValidationError extends Error {}

const newId = uid
const now = () => Date.now()

function requireName(name: unknown): string {
  if (typeof name !== 'string' || name.trim() === '') {
    throw new ValidationError('name must be a non-empty string')
  }
  return name.trim()
}

function requireImportance(importance: unknown): number {
  if (
    typeof importance !== 'number' ||
    !Number.isInteger(importance) ||
    importance < 1 ||
    importance > 5
  ) {
    throw new ValidationError('importance must be an integer between 1 and 5')
  }
  return importance
}

function validateDimensionFields(fields: {
  name: unknown
  kind: unknown
  direction?: unknown
  importance: unknown
  unit?: unknown
}): void {
  requireName(fields.name)
  requireImportance(fields.importance)
  if (fields.kind === 'objective') {
    if (fields.direction !== 'higher' && fields.direction !== 'lower') {
      throw new ValidationError('objective dimensions need a direction (higher|lower)')
    }
  } else if (fields.kind === 'subjective') {
    if (fields.direction !== undefined) {
      throw new ValidationError('subjective dimensions have no direction')
    }
  } else {
    throw new ValidationError("kind must be 'objective' or 'subjective'")
  }
  if (fields.unit !== undefined && typeof fields.unit !== 'string') {
    throw new ValidationError('unit must be a string')
  }
}

async function touch(decisionId: string): Promise<void> {
  await db.decisions.update(decisionId, { updatedAt: now() })
}

async function requireDecision(id: string): Promise<Decision> {
  const decision = await db.decisions.get(id)
  if (!decision) throw new ValidationError(`decision ${id} does not exist`)
  return decision
}

// --- decisions ---------------------------------------------------------------

export async function createDecision(name: string): Promise<Decision> {
  const decision: Decision = {
    id: newId(),
    name: requireName(name),
    createdAt: now(),
    updatedAt: now(),
  }
  await db.decisions.put(decision)
  return decision
}

export async function renameDecision(id: string, name: string): Promise<void> {
  await requireDecision(id)
  await db.decisions.update(id, { name: requireName(name), updatedAt: now() })
}

/**
 * Phase-7 ramble path: a whole decision skeleton (name + dimensions +
 * options) validated up front and written in one transaction — a malformed
 * row never creates a half-built decision.
 */
export async function createDecisionSkeleton(input: DecisionSkeletonInput): Promise<Decision> {
  const name = requireName(input.name)
  if (!Array.isArray(input.dimensions)) throw new ValidationError('dimensions must be an array')
  if (!Array.isArray(input.options)) throw new ValidationError('options must be an array')
  for (const dimension of input.dimensions) validateDimensionFields(dimension)
  for (const option of input.options) {
    requireName(option.name)
    if (option.notes !== undefined && typeof option.notes !== 'string') {
      throw new ValidationError('notes must be a string')
    }
  }
  const decision: Decision = { id: newId(), name, createdAt: now(), updatedAt: now() }
  const dimensions: Dimension[] = input.dimensions.map((d) => ({
    id: newId(),
    decisionId: decision.id,
    name: requireName(d.name),
    kind: d.kind,
    direction: d.kind === 'objective' ? d.direction : undefined,
    importance: requireImportance(d.importance),
    unit: d.unit,
  }))
  const options: Option[] = input.options.map((o) => ({
    id: newId(),
    decisionId: decision.id,
    name: requireName(o.name),
    notes: o.notes,
  }))
  await db.transaction('rw', db.decisions, db.dimensions, db.options, async () => {
    await db.decisions.put(decision)
    if (dimensions.length) await db.dimensions.bulkPut(dimensions)
    if (options.length) await db.options.bulkPut(options)
  })
  return decision
}

/** Deleting a decision deletes everything under it, in one transaction. */
export async function deleteDecision(id: string): Promise<void> {
  await db.transaction('rw', db.decisions, db.dimensions, db.options, db.scores, async () => {
    const optionIds = (
      await db.options.where('decisionId').equals(id).toArray()
    ).map((o) => o.id)
    const dimensionIds = (
      await db.dimensions.where('decisionId').equals(id).toArray()
    ).map((d) => d.id)
    if (optionIds.length) await db.scores.where('optionId').anyOf(optionIds).delete()
    await db.dimensions.bulkDelete(dimensionIds)
    await db.options.bulkDelete(optionIds)
    await db.decisions.delete(id)
  })
}

// --- dimensions ---------------------------------------------------------------

export async function addDimension(
  decisionId: string,
  input: DimensionInput,
): Promise<Dimension> {
  await requireDecision(decisionId)
  validateDimensionFields(input)
  const dimension: Dimension = {
    id: newId(),
    decisionId,
    name: requireName(input.name),
    kind: input.kind,
    direction: input.kind === 'objective' ? input.direction : undefined,
    importance: requireImportance(input.importance),
    unit: input.unit,
  }
  await db.dimensions.put(dimension)
  await touch(decisionId)
  return dimension
}

export interface DimensionPatch {
  name?: string
  kind?: Dimension['kind']
  /** null clears the direction (required when switching to subjective). */
  direction?: Dimension['direction'] | null
  importance?: number
  /** null clears the unit. */
  unit?: string | null
}

/**
 * Changing a dimension's kind makes existing scores meaningless (a weight in
 * kg is not a 1–5 rating), so a kind change wipes that dimension's scores in
 * the same transaction.
 */
export async function updateDimension(id: string, patch: DimensionPatch): Promise<void> {
  const dimension = await db.dimensions.get(id)
  if (!dimension) throw new ValidationError(`dimension ${id} does not exist`)
  // null clears (the JSON-safe form, used by AI patches); an explicit
  // undefined value clears too (key present), matching the pre-Phase-6
  // semantics relied on by the UI forms.
  const clearsDirection = patch.direction === null || ('direction' in patch && patch.direction === undefined)
  const clearsUnit = patch.unit === null || ('unit' in patch && patch.unit === undefined)
  const merged: Dimension = {
    ...dimension,
    ...patch,
    direction: clearsDirection ? undefined : patch.direction ?? dimension.direction,
    unit: clearsUnit ? undefined : patch.unit ?? dimension.unit,
  }
  validateDimensionFields(merged)
  await db.transaction('rw', db.dimensions, db.scores, async () => {
    if (patch.kind !== undefined && patch.kind !== dimension.kind) {
      await db.scores.where('dimensionId').equals(id).delete()
    }
    await db.dimensions.update(id, {
      name: merged.name,
      kind: merged.kind,
      direction: merged.kind === 'objective' ? merged.direction : undefined,
      importance: merged.importance,
      unit: merged.unit,
    })
  })
  await touch(dimension.decisionId)
}

/** Deleting a dimension deletes its scores, in one transaction. */
export async function deleteDimension(id: string): Promise<void> {
  const dimension = await db.dimensions.get(id)
  if (!dimension) throw new ValidationError(`dimension ${id} does not exist`)
  await db.transaction('rw', db.dimensions, db.scores, async () => {
    await db.scores.where('dimensionId').equals(id).delete()
    await db.dimensions.delete(id)
  })
  await touch(dimension.decisionId)
}

// --- options ---------------------------------------------------------------

export async function addOption(decisionId: string, input: OptionInput): Promise<Option> {
  await requireDecision(decisionId)
  const option: Option = {
    id: newId(),
    decisionId,
    name: requireName(input.name),
    notes: input.notes,
  }
  await db.options.put(option)
  await touch(decisionId)
  return option
}

export async function updateOption(
  id: string,
  patch: { name?: string; notes?: string },
): Promise<void> {
  const option = await db.options.get(id)
  if (!option) throw new ValidationError(`option ${id} does not exist`)
  const updates: Partial<Option> = {}
  if (patch.name !== undefined) updates.name = requireName(patch.name)
  if (patch.notes !== undefined) updates.notes = patch.notes
  await db.options.update(id, updates)
  await touch(option.decisionId)
}

/** Deleting an option deletes its scores, in one transaction. */
export async function deleteOption(id: string): Promise<void> {
  const option = await db.options.get(id)
  if (!option) throw new ValidationError(`option ${id} does not exist`)
  await db.transaction('rw', db.options, db.scores, async () => {
    await db.scores.where('optionId').equals(id).delete()
    await db.options.delete(id)
  })
  await touch(option.decisionId)
}

// --- scores ---------------------------------------------------------------

export async function setScore(
  optionId: string,
  dimensionId: string,
  value: number,
): Promise<void> {
  const [option, dimension] = await Promise.all([
    db.options.get(optionId),
    db.dimensions.get(dimensionId),
  ])
  if (!option) throw new ValidationError(`option ${optionId} does not exist`)
  if (!dimension) throw new ValidationError(`dimension ${dimensionId} does not exist`)
  if (option.decisionId !== dimension.decisionId) {
    throw new ValidationError('option and dimension belong to different decisions')
  }
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new ValidationError('score value must be a finite number')
  }
  if (dimension.kind === 'subjective' && (!Number.isInteger(value) || value < 1 || value > 5)) {
    throw new ValidationError('subjective scores must be integers 1..5')
  }
  const score: Score = { optionId, dimensionId, value }
  await db.scores.put(score)
  await touch(option.decisionId)
}

export async function clearScore(optionId: string, dimensionId: string): Promise<void> {
  const option = await db.options.get(optionId)
  await db.scores.delete([optionId, dimensionId])
  if (option) await touch(option.decisionId)
}

// --- backup (JSON export/import) ---------------------------------------------------------------

export async function exportDecision(id: string): Promise<DecisionExport> {
  const decision = await requireDecision(id)
  const [dimensions, options] = await Promise.all([
    db.dimensions.where('decisionId').equals(id).toArray(),
    db.options.where('decisionId').equals(id).toArray(),
  ])
  const optionIds = options.map((o) => o.id)
  const scores = optionIds.length
    ? await db.scores.where('optionId').anyOf(optionIds).toArray()
    : []
  return {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    decision,
    dimensions,
    options,
    scores,
  }
}

/**
 * Imports a whole-decision export with fresh ids (so importing twice never
 * collides); returns the new decision id. All-or-nothing, one transaction.
 */
export async function importDecision(exported: DecisionExport): Promise<string> {
  if (!exported || exported.schemaVersion !== 1) {
    throw new ValidationError('unsupported schemaVersion (expected 1)')
  }
  if (
    !Array.isArray(exported.dimensions) ||
    !Array.isArray(exported.options) ||
    !Array.isArray(exported.scores)
  ) {
    throw new ValidationError('export must carry dimensions, options and scores arrays')
  }
  requireName(exported.decision?.name)

  const dimIdMap = new Map<string, string>()
  const optIdMap = new Map<string, string>()
  const dimensions: Dimension[] = exported.dimensions.map((d) => {
    validateDimensionFields(d)
    if (typeof d.id !== 'string') throw new ValidationError('dimension id must be a string')
    const id = newId()
    dimIdMap.set(d.id, id)
    return {
      id,
      decisionId: '', // set after the new decision id exists
      name: d.name.trim(),
      kind: d.kind,
      direction: d.kind === 'objective' ? d.direction : undefined,
      importance: d.importance,
      unit: d.unit,
    }
  })
  const options: Option[] = exported.options.map((o) => {
    if (typeof o.id !== 'string') throw new ValidationError('option id must be a string')
    const id = newId()
    optIdMap.set(o.id, id)
    return { id, decisionId: '', name: requireName(o.name), notes: o.notes }
  })
  const dimKind = new Map(dimensions.map((d) => [d.id, d.kind]))
  const scores: Score[] = exported.scores.map((s) => {
    const optionId = optIdMap.get(s.optionId)
    const dimensionId = dimIdMap.get(s.dimensionId)
    if (!optionId || !dimensionId) {
      throw new ValidationError('score references an option or dimension missing from the export')
    }
    if (typeof s.value !== 'number' || !Number.isFinite(s.value)) {
      throw new ValidationError('score value must be a finite number')
    }
    if (
      dimKind.get(dimensionId) === 'subjective' &&
      (!Number.isInteger(s.value) || s.value < 1 || s.value > 5)
    ) {
      throw new ValidationError('subjective scores must be integers 1..5')
    }
    return { optionId, dimensionId, value: s.value }
  })

  const decisionId = newId()
  for (const d of dimensions) d.decisionId = decisionId
  for (const o of options) o.decisionId = decisionId
  const decision: Decision = {
    id: decisionId,
    name: exported.decision.name.trim(),
    createdAt: exported.decision.createdAt ?? now(),
    updatedAt: exported.decision.updatedAt ?? now(),
  }

  await db.transaction('rw', db.decisions, db.dimensions, db.options, db.scores, async () => {
    await db.decisions.put(decision)
    await db.dimensions.bulkPut(dimensions)
    await db.options.bulkPut(options)
    await db.scores.bulkPut(scores)
  })
  return decisionId
}
