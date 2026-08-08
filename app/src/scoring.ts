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

// --- sensitivity probes (PLAN.md Phase 4 stretch) ------------------------------
// Pure re-rankings over the same full matrix; they only exist when results
// exist (complete matrix, ≥2 options), so they can never show a stale picture.

export interface BreakEvenProbe {
  optionId: string
  dimensionId: string
  /** Smallest integer importance at which this option leads (ties included). */
  importanceNeeded: number
}

/**
 * "If <dimension> mattered at <importanceNeeded>+ instead of <current>, the
 * winner flips to <option>." For every non-winning option × dimension the
 * option scores better than the winner on, find the smallest importance
 * (current+1..5) at which the option leads the whole field.
 */
export function breakEvenProbes(
  dimensions: Dimension[],
  options: Option[],
  scores: Score[],
): BreakEvenProbe[] {
  const results = rankOptions(dimensions, options, scores)
  if (!results.complete || !results.winner || results.ranking.length < 2) return []
  const winner = results.winner

  const norm = new Map<string, number>()
  for (const r of results.ranking) {
    for (const d of dimensions) norm.set(`${r.option.id}\u0000${d.id}`, r.cells[d.id].normalized)
  }
  const totalWith = (dimensionId: string, importance: number, optionId: string): number => {
    let weightSum = 0
    let weighted = 0
    for (const d of dimensions) {
      const w = d.id === dimensionId ? importance : d.importance
      weightSum += w
      weighted += w * norm.get(`${optionId}\u0000${d.id}`)!
    }
    return weighted / weightSum
  }

  const probes: BreakEvenProbe[] = []
  for (const result of results.ranking.slice(1)) {
    for (const d of dimensions) {
      const challenger = result.cells[d.id].normalized
      if (challenger <= winner.cells[d.id].normalized) continue
      for (let w = d.importance + 1; w <= 5; w++) {
        const mine = totalWith(d.id, w, result.option.id)
        const leads = results.ranking.every(
          (r) => r.option.id === result.option.id || mine >= totalWith(d.id, w, r.option.id) - 1e-9,
        )
        if (leads) {
          probes.push({ optionId: result.option.id, dimensionId: d.id, importanceNeeded: w })
          break
        }
      }
    }
  }
  return probes
}

export interface DropDimensionProbe {
  dimensionId: string
  newWinnerId: string
}

/** Removing which single dimensions flips the winner. */
export function dropOneProbes(
  dimensions: Dimension[],
  options: Option[],
  scores: Score[],
): DropDimensionProbe[] {
  const base = rankOptions(dimensions, options, scores)
  if (!base.complete || !base.winner || options.length < 2 || dimensions.length < 2) return []
  const probes: DropDimensionProbe[] = []
  for (const d of dimensions) {
    const result = rankOptions(
      dimensions.filter((x) => x.id !== d.id),
      options,
      scores.filter((s) => s.dimensionId !== d.id),
    )
    if (result.complete && result.winner && result.winner.option.id !== base.winner.option.id) {
      probes.push({ dimensionId: d.id, newWinnerId: result.winner.option.id })
    }
  }
  return probes
}
