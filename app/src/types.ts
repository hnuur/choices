// Domain types per PLAN.md "Product spec — Data model".

export interface Decision {
  id: string
  name: string
  createdAt: number
  updatedAt: number
}

export type DimensionKind = 'objective' | 'subjective'
export type Direction = 'higher' | 'lower'

export interface Dimension {
  id: string
  decisionId: string
  name: string
  kind: DimensionKind
  /** Numeric objective only; must be undefined for subjective and nominal. */
  direction?: Direction
  /** 1..5 importance weight. */
  importance: number
  unit?: string
}

export interface Option {
  id: string
  decisionId: string
  name: string
  notes?: string
}

/** Row exists ⇒ cell scored; composite primary key [optionId+dimensionId]. */
export interface Score {
  optionId: string
  dimensionId: string
  /** Subjective 1–5 or objective numeric raw value. */
  value?: number
  /** Objective nominal (genre, cuisine, …): one or more labels. */
  labels?: string[]
}

/** JSON backup of a whole decision (mutation layer in Phase 3, UI in Phase 5). */
export interface DecisionExport {
  schemaVersion: 1
  exportedAt: string
  decision: Decision
  dimensions: Dimension[]
  options: Option[]
  scores: Score[]
}

export interface DimensionInput {
  name: string
  kind: DimensionKind
  direction?: Direction
  importance: number
  unit?: string
}

export interface OptionInput {
  name: string
  notes?: string
}

/** Best-effort cell on a ramble skeleton, keyed by name (ids don't exist yet). */
export interface SkeletonScoreInput {
  option: string
  dimension: string
  value?: number
  labels?: string[]
}

/** Whole-decision skeleton (Phase-7 ramble payload → one transactional write). */
export interface DecisionSkeletonInput {
  name: string
  dimensions: DimensionInput[]
  options: OptionInput[]
  /** Optional; unmatched or invalid cells are skipped on write. */
  scores?: SkeletonScoreInput[]
}
