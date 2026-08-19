// Proposal parser per PLAN.md Phase-6: only well-formed typed mutation
// payloads are accepted; malformed or unknown shapes are rejected with a
// ProposalParseError the chat surface renders visibly.

import type { DimensionPatch } from '../mutations'
import type { DecisionSkeletonInput, DimensionInput, OptionInput, SkeletonScoreInput } from '../types'
import { dimensionScale, normalizeLabels } from '../units'

export type Proposal =
  | { type: 'addDimension'; dimension: DimensionInput }
  | { type: 'updateDimension'; id: string; patch: DimensionPatch }
  | { type: 'deleteDimension'; id: string }
  | { type: 'addOption'; option: OptionInput }
  | { type: 'deleteOption'; id: string }
  | { type: 'setScore'; optionId: string; dimensionId: string; value?: number; labels?: string[] }
  /** Phase-7 ramble scope: a whole decision skeleton, created in one go. */
  | { type: 'createDecision'; decision: DecisionSkeletonInput }

export interface ParsedReply {
  /** Prose part of the reply; may be empty. */
  message: string
  proposals: Proposal[]
}

export class ProposalParseError extends Error {}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

function fail(reason: string): never {
  throw new ProposalParseError(reason)
}

function requireRecord(v: unknown, label: string): Record<string, unknown> {
  if (!isRecord(v)) fail(`${label} must be an object`)
  return v
}

function requireString(v: unknown, label: string): string {
  if (typeof v !== 'string' || v.trim() === '') fail(`${label} must be a non-empty string`)
  return v.trim()
}

function requireFiniteNumber(v: unknown, label: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) fail(`${label} must be a finite number`)
  return v
}

function rejectUnknownKeys(obj: Record<string, unknown>, allowed: string[], label: string): void {
  for (const key of Object.keys(obj)) {
    if (!allowed.includes(key)) fail(`unknown field "${key}" in ${label}`)
  }
}

function requireImportance(v: unknown, label: string): number {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 1 || v > 5) {
    fail(`${label} must be an integer between 1 and 5`)
  }
  return v
}

function parseDimensionInput(v: unknown, label: string): DimensionInput {
  const obj = requireRecord(v, label)
  rejectUnknownKeys(obj, ['name', 'kind', 'direction', 'importance', 'unit'], label)
  const name = requireString(obj.name, `${label}.name`)
  const importance = requireImportance(obj.importance, `${label}.importance`)
  if (obj.kind === 'objective') {
    const unit = obj.unit === undefined ? undefined : requireString(obj.unit, `${label}.unit`)
    const scale = dimensionScale({ kind: 'objective', name, unit })
    if (scale === 'nominal') {
      if (
        obj.direction !== undefined &&
        obj.direction !== 'higher' &&
        obj.direction !== 'lower'
      ) {
        fail(`${label}.direction must be "higher", "lower" or omitted`)
      }
      return { name, kind: 'objective', importance, unit }
    }
    if (obj.direction !== 'higher' && obj.direction !== 'lower') {
      fail(`${label}: objective dimensions need direction "higher" or "lower"`)
    }
    return { name, kind: 'objective', direction: obj.direction, importance, unit }
  }
  if (obj.kind === 'subjective') {
    if (obj.direction !== undefined) fail(`${label}: subjective dimensions have no direction`)
    return { name, kind: 'subjective', importance }
  }
  return fail(`${label}.kind must be "objective" or "subjective"`)
}

function parseDimensionPatch(v: unknown, label: string): DimensionPatch {
  const obj = requireRecord(v, label)
  rejectUnknownKeys(obj, ['name', 'kind', 'direction', 'importance', 'unit'], label)
  if (Object.keys(obj).length === 0) fail(`${label} must change at least one field`)
  const patch: DimensionPatch = {}
  if (obj.name !== undefined) patch.name = requireString(obj.name, `${label}.name`)
  if (obj.importance !== undefined) {
    patch.importance = requireImportance(obj.importance, `${label}.importance`)
  }
  if (obj.kind !== undefined) {
    if (obj.kind !== 'objective' && obj.kind !== 'subjective') {
      fail(`${label}.kind must be "objective" or "subjective"`)
    }
    patch.kind = obj.kind
  }
  if (obj.direction !== undefined) {
    if (obj.direction === null) patch.direction = null
    else if (obj.direction === 'higher' || obj.direction === 'lower') patch.direction = obj.direction
    else fail(`${label}.direction must be "higher", "lower" or null`)
  }
  if (obj.unit !== undefined) {
    patch.unit = obj.unit === null ? null : requireString(obj.unit, `${label}.unit`)
  }
  return patch
}

function parseOptionInput(v: unknown, label: string): OptionInput {
  const opt = requireRecord(v, label)
  rejectUnknownKeys(opt, ['name', 'notes'], label)
  const option: OptionInput = { name: requireString(opt.name, `${label}.name`) }
  if (opt.notes !== undefined) option.notes = requireString(opt.notes, `${label}.notes`)
  return option
}

function parseLabels(v: unknown, label: string): string[] {
  if (!Array.isArray(v) || v.some((x) => typeof x !== 'string')) {
    fail(`${label}.labels must be an array of strings`)
  }
  return normalizeLabels(v as string[])
}

/**
 * Models often emit both a leftover 1–5 `value` and `labels` on categorical
 * cells. Prefer non-empty labels; otherwise require a finite value.
 */
function parseScoreFields(
  obj: Record<string, unknown>,
  label: string,
): { value: number } | { labels: string[] } {
  const hasValue = obj.value !== undefined
  const hasLabels = obj.labels !== undefined
  const labels = hasLabels ? parseLabels(obj.labels, label) : []
  if (labels.length > 0) return { labels }
  if (hasValue) return { value: requireFiniteNumber(obj.value, `${label}.value`) }
  if (hasLabels) fail(`${label}.labels must contain at least one value`)
  fail(`${label} needs exactly one of value or labels`)
}

function parseSkeletonScore(v: unknown, label: string): SkeletonScoreInput {
  const obj = requireRecord(v, label)
  rejectUnknownKeys(obj, ['option', 'dimension', 'value', 'labels'], label)
  const option = requireString(obj.option, `${label}.option`)
  const dimension = requireString(obj.dimension, `${label}.dimension`)
  return { option, dimension, ...parseScoreFields(obj, label) }
}

function parseDecisionSkeleton(v: unknown, label: string): DecisionSkeletonInput {
  const dec = requireRecord(v, label)
  rejectUnknownKeys(dec, ['name', 'dimensions', 'options', 'scores'], label)
  const name = requireString(dec.name, `${label}.name`)
  const dimensions: DimensionInput[] =
    dec.dimensions === undefined
      ? []
      : Array.isArray(dec.dimensions)
        ? dec.dimensions.map((d, i) => parseDimensionInput(d, `${label}.dimensions[${i + 1}]`))
        : fail(`${label}.dimensions must be an array`)
  const options: OptionInput[] =
    dec.options === undefined
      ? []
      : Array.isArray(dec.options)
        ? dec.options.map((o, i) => parseOptionInput(o, `${label}.options[${i + 1}]`))
        : fail(`${label}.options must be an array`)
  const scores: SkeletonScoreInput[] | undefined =
    dec.scores === undefined
      ? undefined
      : Array.isArray(dec.scores)
        ? dec.scores.map((s, i) => parseSkeletonScore(s, `${label}.scores[${i + 1}]`))
        : fail(`${label}.scores must be an array`)
  return scores ? { name, dimensions, options, scores } : { name, dimensions, options }
}

function parseProposal(raw: unknown, index: number): Proposal {
  const label = `proposal ${index + 1}`
  const obj = requireRecord(raw, label)
  switch (obj.type) {
    case 'addDimension': {
      rejectUnknownKeys(obj, ['type', 'dimension'], label)
      return { type: 'addDimension', dimension: parseDimensionInput(obj.dimension, `${label}.dimension`) }
    }
    case 'updateDimension': {
      rejectUnknownKeys(obj, ['type', 'id', 'patch'], label)
      return {
        type: 'updateDimension',
        id: requireString(obj.id, `${label}.id`),
        patch: parseDimensionPatch(obj.patch, `${label}.patch`),
      }
    }
    case 'deleteDimension': {
      rejectUnknownKeys(obj, ['type', 'id'], label)
      return { type: 'deleteDimension', id: requireString(obj.id, `${label}.id`) }
    }
    case 'addOption': {
      rejectUnknownKeys(obj, ['type', 'option'], label)
      return { type: 'addOption', option: parseOptionInput(obj.option, `${label}.option`) }
    }
    case 'deleteOption': {
      rejectUnknownKeys(obj, ['type', 'id'], label)
      return { type: 'deleteOption', id: requireString(obj.id, `${label}.id`) }
    }
    case 'setScore': {
      rejectUnknownKeys(obj, ['type', 'optionId', 'dimensionId', 'value', 'labels'], label)
      const optionId = requireString(obj.optionId, `${label}.optionId`)
      const dimensionId = requireString(obj.dimensionId, `${label}.dimensionId`)
      return { type: 'setScore', optionId, dimensionId, ...parseScoreFields(obj, label) }
    }
    case 'createDecision': {
      rejectUnknownKeys(obj, ['type', 'decision'], label)
      return { type: 'createDecision', decision: parseDecisionSkeleton(obj.decision, `${label}.decision`) }
    }
    case undefined:
      return fail(`${label} has no type`)
    default:
      return fail(`${label} has unknown type "${String(obj.type)}"`)
  }
}

function parseProposalsArray(v: unknown): Proposal[] {
  if (!Array.isArray(v)) fail('proposals must be an array')
  return v.map((raw, i) => parseProposal(raw, i))
}

function closeOpenBrackets(s: string): string {
  const stack: string[] = []
  let inString = false
  let escape = false
  for (const ch of s) {
    if (inString) {
      if (escape) escape = false
      else if (ch === '\\') escape = true
      else if (ch === '"') inString = false
      continue
    }
    if (ch === '"') {
      inString = true
      continue
    }
    if (ch === '{' || ch === '[') stack.push(ch)
    else if (ch === '}' || ch === ']') stack.pop()
  }
  let out = s.replace(/,\s*$/, '')
  if (inString) out += '"'
  out = out.replace(/,\s*$/, '')
  while (stack.length > 0) {
    out += stack.pop() === '{' ? '}' : ']'
  }
  return out
}

function parseJsonLoose(raw: string): unknown {
  const trimmed = raw.trim()
  try {
    return JSON.parse(trimmed)
  } catch {
    /* truncated dumps are common on a full score matrix */
  }
  const lastBrace = trimmed.lastIndexOf('}')
  if (lastBrace < 0) fail('the JSON block in the reply is malformed')
  try {
    return JSON.parse(closeOpenBrackets(trimmed.slice(0, lastBrace + 1)))
  } catch {
    fail('the JSON block in the reply is malformed')
  }
}

/**
 * Pulls a proposals JSON payload out of a reply: a closed fence, an unclosed
 * fence (truncated generation), or a bare object that contains "proposals".
 */
function extractJsonBlock(text: string): { json: string; prose: string } | null {
  const closed = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (closed && closed.index !== undefined) {
    return { json: closed[1], prose: text.slice(0, closed.index).trim() }
  }
  const open = text.match(/```(?:json)?\s*([\s\S]*)$/)
  if (open && open.index !== undefined && /[{[]/.test(open[1])) {
    return { json: open[1], prose: text.slice(0, open.index).trim() }
  }
  const bare = text.search(/\{\s*"(?:message|proposals)"\s*:/)
  if (bare >= 0) {
    return { json: text.slice(bare), prose: text.slice(0, bare).trim() }
  }
  return null
}

/**
 * Extracts the first JSON proposals block from a reply. Replies without one
 * are prose-only (results questions etc.) and carry no proposals.
 */
export function parseReply(text: string): ParsedReply {
  const block = extractJsonBlock(text)
  if (!block) return { message: text.trim(), proposals: [] }

  const parsed = parseJsonLoose(block.json)

  if (Array.isArray(parsed)) {
    return { message: block.prose, proposals: parseProposalsArray(parsed) }
  }
  const obj = requireRecord(parsed, 'reply JSON')
  rejectUnknownKeys(obj, ['message', 'proposals'], 'reply JSON')
  const message = obj.message === undefined ? '' : requireString(obj.message, 'message')
  const proposals = obj.proposals === undefined ? [] : parseProposalsArray(obj.proposals)
  return { message: [block.prose, message].filter(Boolean).join('\n\n'), proposals }
}
