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
  SkeletonScoreInput,
} from './types'
import { dimensionScale, normalizeLabels } from './units'

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

function dimensionFromFields(fields: {
  name: unknown
  kind: unknown
  direction?: unknown
  importance: unknown
  unit?: unknown
}): Pick<Dimension, 'name' | 'kind' | 'direction' | 'importance' | 'unit'> {
  const name = requireName(fields.name)
  const importance = requireImportance(fields.importance)
  if (fields.unit !== undefined && typeof fields.unit !== 'string') {
    throw new ValidationError('unit must be a string')
  }
  const unit = typeof fields.unit === 'string' ? fields.unit : undefined
  if (fields.kind === 'subjective') {
    if (fields.direction !== undefined) {
      throw new ValidationError('subjective dimensions have no direction')
    }
    return { name, kind: 'subjective', direction: undefined, importance }
  }
  if (fields.kind !== 'objective') {
    throw new ValidationError("kind must be 'objective' or 'subjective'")
  }
  const scale = dimensionScale({ kind: 'objective', name, unit })
  if (scale === 'nominal') {
    return { name, kind: 'objective', direction: undefined, importance, unit }
  }
  if (fields.direction !== 'higher' && fields.direction !== 'lower') {
    throw new ValidationError('objective dimensions need a direction (higher|lower)')
  }
  return { name, kind: 'objective', direction: fields.direction, importance, unit }
}

function validateDimensionFields(fields: {
  name: unknown
  kind: unknown
  direction?: unknown
  importance: unknown
  unit?: unknown
}): void {
  dimensionFromFields(fields)
}

function persistDimension(d: Dimension): Dimension {
  const out: Dimension = {
    id: d.id,
    decisionId: d.decisionId,
    name: d.name,
    kind: d.kind,
    importance: d.importance,
  }
  if (d.direction) out.direction = d.direction
  if (d.unit) out.unit = d.unit
  return out
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

function findUniqueByName<T extends { name: string }>(items: T[], name: string): T | undefined {
  const needle = name.trim().toLowerCase()
  const hits = items.filter((item) => item.name.trim().toLowerCase() === needle)
  return hits.length === 1 ? hits[0] : undefined
}

function scorePayloadOk(dimension: Dimension, cell: { value?: unknown; labels?: unknown }): boolean {
  const scale = dimensionScale(dimension)
  if (scale === 'nominal') {
    return Array.isArray(cell.labels) &&
      normalizeLabels(cell.labels.filter((x): x is string => typeof x === 'string')).length > 0
  }
  if (typeof cell.value !== 'number' || !Number.isFinite(cell.value)) return false
  if (scale === 'rating' && (!Number.isInteger(cell.value) || cell.value < 1 || cell.value > 5)) {
    return false
  }
  return true
}

/** Best-effort: skip unmatched names, duplicates, and invalid values. */
export function resolveSkeletonScores(
  dimensions: Dimension[],
  options: Option[],
  scores: SkeletonScoreInput[] | undefined,
): Score[] {
  if (!scores || scores.length === 0) return []
  const out: Score[] = []
  const seen = new Set<string>()
  for (const cell of scores) {
    const option = findUniqueByName(options, cell.option)
    const dimension = findUniqueByName(dimensions, cell.dimension)
    if (!option || !dimension || !scorePayloadOk(dimension, cell)) continue
    const key = `${option.id}\0${dimension.id}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(
      dimensionScale(dimension) === 'nominal'
        ? { optionId: option.id, dimensionId: dimension.id, labels: normalizeLabels(cell.labels ?? []) }
        : { optionId: option.id, dimensionId: dimension.id, value: cell.value },
    )
  }
  return out
}

/**
 * Phase-7 ramble path: a whole decision skeleton (name + dimensions +
 * options, optional best-effort scores) validated up front and written in
 * one transaction — a malformed row never creates a half-built decision.
 * Unmatched or invalid score cells are skipped.
 */
export async function createDecisionSkeleton(input: DecisionSkeletonInput): Promise<Decision> {
  const name = requireName(input.name)
  if (!Array.isArray(input.dimensions)) throw new ValidationError('dimensions must be an array')
  if (!Array.isArray(input.options)) throw new ValidationError('options must be an array')
  if (input.scores !== undefined && !Array.isArray(input.scores)) {
    throw new ValidationError('scores must be an array')
  }
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
    ...dimensionFromFields(d),
  }))
  const options: Option[] = input.options.map((o) => ({
    id: newId(),
    decisionId: decision.id,
    name: requireName(o.name),
    notes: o.notes,
  }))
  const scores = resolveSkeletonScores(dimensions, options, input.scores)
  await db.transaction('rw', db.decisions, db.dimensions, db.options, db.scores, async () => {
    await db.decisions.put(decision)
    if (dimensions.length) await db.dimensions.bulkPut(dimensions.map(persistDimension))
    if (options.length) await db.options.bulkPut(options)
    if (scores.length) await db.scores.bulkPut(scores)
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
  const fields = dimensionFromFields(input)
  const dimension: Dimension = {
    id: newId(),
    decisionId,
    ...fields,
  }
  await db.dimensions.put(persistDimension(dimension))
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
 * Changing a dimension's kind or scale (numeric ↔ nominal, or to/from
 * 1–5) makes existing scores meaningless, so those scores are wiped in
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
  const fields = dimensionFromFields(merged)
  const next: Dimension = { ...dimension, ...fields }
  const scaleChanged = dimensionScale(dimension) !== dimensionScale(next)
  await db.transaction('rw', db.dimensions, db.scores, async () => {
    if (scaleChanged) {
      await db.scores.where('dimensionId').equals(id).delete()
    }
    await db.dimensions.put(persistDimension(next))
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
  valueOrLabels: number | string[],
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
  const scale = dimensionScale(dimension)
  let score: Score
  if (scale === 'nominal') {
    if (!Array.isArray(valueOrLabels)) {
      throw new ValidationError('categorical scores take one or more labels')
    }
    const labels = normalizeLabels(valueOrLabels)
    if (labels.length === 0) {
      throw new ValidationError('categorical scores need at least one label')
    }
    score = { optionId, dimensionId, labels }
  } else {
    if (typeof valueOrLabels !== 'number' || !Number.isFinite(valueOrLabels)) {
      throw new ValidationError('score value must be a finite number')
    }
    if (scale === 'rating' && (!Number.isInteger(valueOrLabels) || valueOrLabels < 1 || valueOrLabels > 5)) {
      throw new ValidationError('subjective scores must be integers 1..5')
    }
    score = { optionId, dimensionId, value: valueOrLabels }
  }
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
      ...dimensionFromFields(d),
    }
  })
  const options: Option[] = exported.options.map((o) => {
    if (typeof o.id !== 'string') throw new ValidationError('option id must be a string')
    const id = newId()
    optIdMap.set(o.id, id)
    return { id, decisionId: '', name: requireName(o.name), notes: o.notes }
  })
  const dimByNewId = new Map(dimensions.map((d) => [d.id, d]))
  const scores: Score[] = exported.scores.map((s) => {
    const optionId = optIdMap.get(s.optionId)
    const dimensionId = dimIdMap.get(s.dimensionId)
    if (!optionId || !dimensionId) {
      throw new ValidationError('score references an option or dimension missing from the export')
    }
    const dimension = dimByNewId.get(dimensionId)!
    if (!scorePayloadOk(dimension, s)) {
      throw new ValidationError(
        dimensionScale(dimension) === 'nominal'
          ? 'categorical scores need at least one label'
          : dimensionScale(dimension) === 'rating'
            ? 'subjective scores must be integers 1..5'
            : 'score value must be a finite number',
      )
    }
    return dimensionScale(dimension) === 'nominal'
      ? { optionId, dimensionId, labels: normalizeLabels(s.labels ?? []) }
      : { optionId, dimensionId, value: s.value }
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
    await db.dimensions.bulkPut(dimensions.map(persistDimension))
    await db.options.bulkPut(options)
    await db.scores.bulkPut(scores)
  })
  return decisionId
}
