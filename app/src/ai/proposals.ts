// Proposal parser per PLAN.md Phase-6: only well-formed typed mutation
// payloads are accepted; malformed or unknown shapes are rejected with a
// ProposalParseError the chat surface renders visibly.

import type { DimensionPatch } from '../mutations'
import type { DimensionInput, OptionInput } from '../types'

export type Proposal =
  | { type: 'addDimension'; dimension: DimensionInput }
  | { type: 'updateDimension'; id: string; patch: DimensionPatch }
  | { type: 'deleteDimension'; id: string }
  | { type: 'addOption'; option: OptionInput }
  | { type: 'deleteOption'; id: string }
  | { type: 'setScore'; optionId: string; dimensionId: string; value: number }

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
    if (obj.direction !== 'higher' && obj.direction !== 'lower') {
      fail(`${label}: objective dimensions need direction "higher" or "lower"`)
    }
    const unit = obj.unit === undefined ? undefined : requireString(obj.unit, `${label}.unit`)
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
      const opt = requireRecord(obj.option, `${label}.option`)
      rejectUnknownKeys(opt, ['name', 'notes'], `${label}.option`)
      const option: OptionInput = { name: requireString(opt.name, `${label}.option.name`) }
      if (opt.notes !== undefined) option.notes = requireString(opt.notes, `${label}.option.notes`)
      return { type: 'addOption', option }
    }
    case 'deleteOption': {
      rejectUnknownKeys(obj, ['type', 'id'], label)
      return { type: 'deleteOption', id: requireString(obj.id, `${label}.id`) }
    }
    case 'setScore': {
      rejectUnknownKeys(obj, ['type', 'optionId', 'dimensionId', 'value'], label)
      return {
        type: 'setScore',
        optionId: requireString(obj.optionId, `${label}.optionId`),
        dimensionId: requireString(obj.dimensionId, `${label}.dimensionId`),
        value: requireFiniteNumber(obj.value, `${label}.value`),
      }
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

/**
 * Extracts the first fenced JSON block from a reply. Replies without one are
 * prose-only (results questions etc.) and carry no proposals.
 */
export function parseReply(text: string): ParsedReply {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (!fence) return { message: text.trim(), proposals: [] }

  let parsed: unknown
  try {
    parsed = JSON.parse(fence[1])
  } catch {
    fail('the JSON block in the reply is malformed')
  }

  if (Array.isArray(parsed)) {
    return { message: text.slice(0, fence.index).trim(), proposals: parseProposalsArray(parsed) }
  }
  const obj = requireRecord(parsed, 'reply JSON')
  rejectUnknownKeys(obj, ['message', 'proposals'], 'reply JSON')
  const message = obj.message === undefined ? '' : requireString(obj.message, 'message')
  const proposals = obj.proposals === undefined ? [] : parseProposalsArray(obj.proposals)
  const prose = text.slice(0, fence.index).trim()
  return { message: [prose, message].filter(Boolean).join('\n\n'), proposals }
}
