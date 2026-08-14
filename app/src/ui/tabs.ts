// Tab definitions shared by the decision view and the chat sheet (the sheet
// shows the active tab as its context chip). Opening a decision lands on the
// tab that matches the home-row status (Phase 12 pass 2).

import { rankOptions } from '../scoring'
import type { Dimension, Option, Score } from '../types'

export type Tab = 'dimensions' | 'options' | 'score' | 'results'

export const TABS: { id: Tab; label: string }[] = [
  { id: 'dimensions', label: 'Dimensions' },
  { id: 'options', label: 'Options' },
  { id: 'score', label: 'Score' },
  { id: 'results', label: 'Results' },
]

export function entryTab(
  dimensions: Dimension[],
  options: Option[],
  scores: Score[],
): Tab {
  const results = rankOptions(dimensions, options, scores)
  if (results.complete) return 'results'
  if (results.totalCells > 0) return 'score'
  return 'dimensions'
}
