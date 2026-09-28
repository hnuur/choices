// Coerce AI setScore rows against the live decision before the approval
// card validates them. The parser cannot know dimension scale, so models
// that emit both value and labels (or the wrong one) used to leave the
// whole Approve button disabled.

import type { DecisionBundle } from '../queries'
import type { Dimension } from '../types'
import { dimensionScale } from '../units'
import type { Proposal } from './proposals'

export type SetScoreProposal = Extract<Proposal, { type: 'setScore' }>

/** Pick value vs labels to match the dimension's scale. */
export function coerceSetScore(p: SetScoreProposal, dim: Dimension): SetScoreProposal {
  const scale = dimensionScale(dim)
  if (scale === 'nominal') {
    const labels = p.labels?.length ? p.labels : []
    return { type: 'setScore', optionId: p.optionId, dimensionId: dim.id, labels }
  }
  if (p.value !== undefined && Number.isFinite(p.value)) {
    return {
      type: 'setScore',
      optionId: p.optionId,
      dimensionId: dim.id,
      value: p.value,
    }
  }
  // Model sometimes puts the 1–5 in labels on a rating dim.
  if (scale === 'rating' && p.labels?.length) {
    const n = Number(p.labels[0])
    if (Number.isInteger(n) && n >= 1 && n <= 5) {
      return { type: 'setScore', optionId: p.optionId, dimensionId: dim.id, value: n }
    }
  }
  // Rating with no usable value: default mid so the card is approvable;
  // numeric without a value stays empty for the user to fill.
  if (scale === 'rating') {
    return { type: 'setScore', optionId: p.optionId, dimensionId: dim.id, value: 3 }
  }
  return { type: 'setScore', optionId: p.optionId, dimensionId: dim.id, value: p.value }
}

export interface SanitizedProposals {
  proposals: Proposal[]
  /** Rows dropped because option/dimension ids were not in this decision. */
  dropped: number
}

/**
 * Rewrites setScore rows for this decision: keep both-scale payloads down
 * to the field the dimension needs, drop ids that are not in the bundle.
 * Other proposal types pass through.
 */
export function sanitizeProposals(proposals: Proposal[], bundle: DecisionBundle): SanitizedProposals {
  const optionIds = new Set(bundle.options.map((o) => o.id))
  const dimensions = new Map(bundle.dimensions.map((d) => [d.id, d]))
  const out: Proposal[] = []
  let dropped = 0

  for (const p of proposals) {
    if (p.type !== 'setScore') {
      out.push(p)
      continue
    }
    if (!optionIds.has(p.optionId) || !dimensions.has(p.dimensionId)) {
      dropped++
      continue
    }
    const dim = dimensions.get(p.dimensionId)!
    const coerced = coerceSetScore(p, dim)
    const scale = dimensionScale(dim)
    // Empty / unusable cells disable the whole Approve button — drop them.
    if (scale === 'nominal' && (!coerced.labels || coerced.labels.length === 0)) {
      dropped++
      continue
    }
    if (scale !== 'nominal' && (coerced.value === undefined || !Number.isFinite(coerced.value))) {
      dropped++
      continue
    }
    if (
      scale === 'rating' &&
      (coerced.value === undefined ||
        !Number.isInteger(coerced.value) ||
        coerced.value < 1 ||
        coerced.value > 5)
    ) {
      dropped++
      continue
    }
    out.push(coerced)
  }

  return { proposals: out, dropped }
}
