// Typed read side of the mutation contract: UI renders from these queries,
// never from Dexie directly. Pair with useLiveQuery for live updates.

import { db } from './db'
import type { Decision, Dimension, Option, Score } from './types'

export interface HomeData {
  /** Most recently updated first. */
  decisions: Decision[]
  dimensions: Dimension[]
  options: Option[]
  scores: Score[]
}

export async function queryHome(): Promise<HomeData> {
  const [decisions, dimensions, options, scores] = await Promise.all([
    db.decisions.orderBy('updatedAt').reverse().toArray(),
    db.dimensions.toArray(),
    db.options.toArray(),
    db.scores.toArray(),
  ])
  return { decisions, dimensions, options, scores }
}

export interface DecisionBundle {
  decision: Decision
  /** Sorted by name for stable display (schema carries no position field). */
  dimensions: Dimension[]
  options: Option[]
  scores: Score[]
}

/** null (not undefined) once loaded-but-absent, so the UI can navigate home. */
export async function queryDecision(id: string): Promise<DecisionBundle | null> {
  const decision = await db.decisions.get(id)
  if (!decision) return null
  const [dimensions, options] = await Promise.all([
    db.dimensions.where('decisionId').equals(id).toArray(),
    db.options.where('decisionId').equals(id).toArray(),
  ])
  dimensions.sort((a, b) => a.name.localeCompare(b.name))
  options.sort((a, b) => a.name.localeCompare(b.name))
  const optionIds = new Set(options.map((o) => o.id))
  const scores = (await db.scores.toArray()).filter((s) => optionIds.has(s.optionId))
  return { decision, dimensions, options, scores }
}
