// Scoring engine per PLAN.md "Product spec — Scoring math". Pure functions;
// no storage access. Known accepted weakness: set-relative min-max (see plan).

import type { Dimension, Option, Score } from './types'

/** Margins at or below this are flagged "effectively tied". */
export const NEAR_TIE_MARGIN = 0.02

export function normalizeObjective(values: number[], direction: 'higher' | 'lower'): number[] {
  if (values.length === 0) return []
  const min = Math.min(...values)
  const max = Math.max(...values)
  if (min === max) return values.map(() => 1)
  const span = max - min
  return values.map((x) =>
    direction === 'higher' ? (x - min) / span : (max - x) / span,
  )
}

/** Subjective 1–5 rating → 0..1. */
export function subjectiveScore(rating: number): number {
  return (rating - 1) / 4
}

export interface Cell {
  raw: number
  normalized: number
}

export interface OptionResult {
  option: Option
  total: number
  /** dimensionId -> cell */
  cells: Record<string, Cell>
}

export interface Results {
  /** Full matrix required before results (PLAN.md locked decision). */
  complete: boolean
  scoredCells: number
  totalCells: number
  /** Sorted by total desc; empty until complete. */
  ranking: OptionResult[]
  winner?: OptionResult
  /** winner.total − runner-up.total; undefined with fewer than 2 options. */
  margin?: number
  nearTie: boolean
  /** Dimensions that cannot separate any options (all normalized scores equal). */
  nonDiscriminating: Dimension[]
}

const cellKey = (optionId: string, dimensionId: string) => `${optionId}\u0000${dimensionId}`

export function rankOptions(
  dimensions: Dimension[],
  options: Option[],
  scores: Score[],
): Results {
  const totalCells = options.length * dimensions.length
  const byCell = new Map<string, number>()
  for (const s of scores) byCell.set(cellKey(s.optionId, s.dimensionId), s.value)

  const scoredCells = options.reduce(
    (n, o) =>
      n + dimensions.filter((d) => byCell.has(cellKey(o.id, d.id))).length,
    0,
  )

  const complete = totalCells > 0 && scoredCells === totalCells
  if (!complete) {
    return {
      complete,
      scoredCells,
      totalCells,
      ranking: [],
      nearTie: false,
      nonDiscriminating: [],
    }
  }

  const importanceSum = dimensions.reduce((n, d) => n + d.importance, 0)

  // dimensionId -> normalized score in options[] order
  const normalized = new Map<string, number[]>()
  const nonDiscriminating: Dimension[] = []
  for (const d of dimensions) {
    const raws = options.map((o) => byCell.get(cellKey(o.id, d.id))!)
    const norms =
      d.kind === 'objective'
        ? normalizeObjective(raws, d.direction ?? 'higher')
        : raws.map(subjectiveScore)
    normalized.set(d.id, norms)
    if (options.length > 1 && norms.every((v) => v === norms[0])) {
      nonDiscriminating.push(d)
    }
  }

  const ranking: OptionResult[] = options
    .map((option, i) => {
      const cells: Record<string, Cell> = {}
      let weighted = 0
      for (const d of dimensions) {
        const norm = normalized.get(d.id)![i]
        cells[d.id] = { raw: byCell.get(cellKey(option.id, d.id))!, normalized: norm }
        weighted += d.importance * norm
      }
      return { option, total: weighted / importanceSum, cells }
    })
    .sort((a, b) => b.total - a.total)

  const winner = ranking[0]
  const margin =
    ranking.length > 1 ? ranking[0].total - ranking[1].total : undefined

  return {
    complete,
    scoredCells,
    totalCells,
    ranking,
    winner,
    margin,
    // float tolerance: 1 − 0.98 computes to 0.020000000000000018
    nearTie: margin !== undefined && margin <= NEAR_TIE_MARGIN + 1e-9,
    nonDiscriminating,
  }
}
