// Applies an (approved, possibly user-edited) approval card through the
// mutation layer — the same typed payloads the UI uses, nothing else.
// Semantic checks the parser cannot make live here: ids must belong to this
// decision. Score values are validated by the mutation layer (subjective
// ratings must be integers 1–5).

import {
  addDimension,
  addOption,
  createDecisionSkeleton,
  deleteDimension,
  deleteOption,
  setScore,
  updateDimension,
} from '../mutations'
import { queryDecision } from '../queries'
import type { Decision, DecisionSkeletonInput } from '../types'
import type { Proposal } from './proposals'

export interface ApplyOutcome {
  index: number
  ok: boolean
  /** Human-readable row description for the collapsed result state. */
  label: string
  error?: string
}

export function describeProposal(p: Proposal): string {
  switch (p.type) {
    case 'addDimension':
      return `Add dimension “${p.dimension.name}”`
    case 'updateDimension':
      return 'Update dimension'
    case 'deleteDimension':
      return 'Delete dimension'
    case 'addOption':
      return `Add option “${p.option.name}”`
    case 'deleteOption':
      return 'Delete option'
    case 'setScore':
      return 'Set score'
    case 'createDecision':
      return `Create decision “${p.decision.name}”`
  }
}

/**
 * Phase-7 ramble path: the approved (possibly user-edited) skeleton becomes
 * a decision in one transactional mutation-layer call. Errors bubble to the
 * ramble surface, which shows them and writes nothing.
 */
export async function applyDecisionSkeleton(skeleton: DecisionSkeletonInput): Promise<Decision> {
  return createDecisionSkeleton(skeleton)
}

/**
 * Applies rows sequentially and reports each outcome; a failing row never
 * blocks the rest of the card. Every write goes through the mutation layer.
 */
export async function applyProposals(
  decisionId: string,
  proposals: Proposal[],
): Promise<ApplyOutcome[]> {
  const outcomes: ApplyOutcome[] = []
  for (let index = 0; index < proposals.length; index++) {
    const p = proposals[index]
    const label = describeProposal(p)
    try {
      // Fresh bundle per row so membership checks see prior rows' effects.
      const bundle = await queryDecision(decisionId)
      if (!bundle) throw new Error('decision no longer exists')
      const dimensionIds = new Set(bundle.dimensions.map((d) => d.id))
      const optionIds = new Set(bundle.options.map((o) => o.id))

      switch (p.type) {
        case 'addDimension':
          await addDimension(decisionId, p.dimension)
          break
        case 'addOption':
          await addOption(decisionId, p.option)
          break
        case 'updateDimension':
          if (!dimensionIds.has(p.id)) throw new Error('dimension is not in this decision')
          await updateDimension(p.id, p.patch)
          break
        case 'deleteDimension':
          if (!dimensionIds.has(p.id)) throw new Error('dimension is not in this decision')
          await deleteDimension(p.id)
          break
        case 'deleteOption':
          if (!optionIds.has(p.id)) throw new Error('option is not in this decision')
          await deleteOption(p.id)
          break
        case 'setScore': {
          if (!optionIds.has(p.optionId)) throw new Error('option is not in this decision')
          if (!dimensionIds.has(p.dimensionId)) throw new Error('dimension is not in this decision')
          await setScore(p.optionId, p.dimensionId, p.labels ?? p.value!)
          break
        }
        case 'createDecision':
          // Ramble scope only — a decision-bound card can never create one.
          throw new Error('new decisions are only created from a ramble')
      }
      outcomes.push({ index, ok: true, label })
    } catch (e) {
      outcomes.push({ index, ok: false, label, error: e instanceof Error ? e.message : String(e) })
    }
  }
  return outcomes
}
