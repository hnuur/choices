// The only module that imports Dexie. Everything else goes through the
// mutation layer (PLAN.md: "UI never touches Dexie directly").
import Dexie, { type Table } from 'dexie'
import type { Decision, Dimension, Option, Score } from './types'

export class ChoicesDB extends Dexie {
  decisions!: Table<Decision, string>
  dimensions!: Table<Dimension, string>
  options!: Table<Option, string>
  scores!: Table<Score, [string, string]>

  constructor(name = 'choices') {
    super(name)
    // Versioned from day one so migrations stay routine.
    this.version(1).stores({
      decisions: 'id, name, updatedAt',
      dimensions: 'id, decisionId',
      options: 'id, decisionId',
      scores: '[optionId+dimensionId], optionId, dimensionId',
    })
  }
}

export const db = new ChoicesDB()
