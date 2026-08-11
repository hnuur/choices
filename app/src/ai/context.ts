// Conversation context per PLAN.md Phase-6: each message carries a snapshot
// of the decision (stateless, small) plus a system prompt describing the
// response contract. The snapshot is the only decision data that leaves the
// device — disclosed in AI settings, nowhere else.

import type { DecisionBundle } from '../queries'
import { rankOptions, NEAR_TIE_MARGIN } from '../scoring'
import type { Tab } from '../ui/tabs'

const LEVEL_FOCUS: Record<Tab, string> = {
  dimensions:
    'The user is on the Dimensions tab: they most likely want to add, refine, split, rebalance (importance) or remove dimensions.',
  options:
    'The user is on the Options tab: they most likely want to add or remove options, or prefill objective scores.',
  score:
    'The user is on the Score tab: they most likely want help filling objective cells (raw values with units).',
  results:
    'The user is on the Results tab: they want explanations of the ranking — answer from the computed results in the snapshot, never invent numbers.',
}

export function systemPrompt(tab: Tab): string {
  return `You are the built-in assistant of Choices, a local-first app for choosing between instances of a thing. The user defines dimensions (objective ones carry a raw value + unit + direction; subjective ones are 1–5 ratings), options, and scores; the app ranks options by importance-weighted totals.

${LEVEL_FOCUS[tab]}

The current decision is attached as JSON. Dimensions and options carry ids — reference those ids, never invent new ones for existing things.

Response contract:
- If no changes are needed, answer in plain prose; no JSON block.
- To propose changes, include exactly one fenced \`\`\`json block of shape {"message": string, "proposals": [...]}. The user reviews every proposal on an approval card and may edit or delete rows before applying, so propose concrete values.
- Payload types:
  - {"type":"addDimension","dimension":{"name","kind":"objective"|"subjective","direction":"higher"|"lower" (objective only),"importance":1-5,"unit"?}}
  - {"type":"updateDimension","id","patch":{any of name/kind/direction/importance/unit}}
  - {"type":"deleteDimension","id"}
  - {"type":"addOption","option":{"name","notes"?}}
  - {"type":"deleteOption","id"}
  - {"type":"setScore","optionId","dimensionId","value"}
- setScore is for objective dimensions only; never propose subjective ratings — those are the user's personal judgement. You may discuss how to read a 1–5 scale in prose.
- Keep proposals minimal: only what the user asked for. Importance weights are integers 1–5.`
}

interface Snapshot {
  decision: { id: string; name: string }
  dimensions: unknown[]
  options: unknown[]
  scores: { optionId: string; dimensionId: string; value: number }[]
  results?: unknown
}

export function decisionSnapshot(bundle: DecisionBundle): string {
  const results = rankOptions(bundle.dimensions, bundle.options, bundle.scores)
  const snapshot: Snapshot = {
    decision: { id: bundle.decision.id, name: bundle.decision.name },
    dimensions: bundle.dimensions.map((d) => ({
      id: d.id,
      name: d.name,
      kind: d.kind,
      ...(d.kind === 'objective' ? { direction: d.direction, unit: d.unit ?? null } : {}),
      importance: d.importance,
    })),
    options: bundle.options.map((o) => ({ id: o.id, name: o.name, notes: o.notes ?? null })),
    scores: bundle.scores.map((s) => ({
      optionId: s.optionId,
      dimensionId: s.dimensionId,
      value: s.value,
    })),
  }
  if (results.complete && results.winner) {
    snapshot.results = {
      ranking: results.ranking.map((r) => ({
        optionId: r.option.id,
        name: r.option.name,
        total: Number(r.total.toFixed(4)),
      })),
      winner: results.winner.option.name,
      margin: results.margin === undefined ? null : Number(results.margin.toFixed(4)),
      nearTie: results.margin !== undefined && results.margin <= NEAR_TIE_MARGIN,
      nonDiscriminating: results.nonDiscriminating.map((d) => d.name),
    }
  } else {
    snapshot.results = {
      complete: false,
      scoredCells: results.scoredCells,
      totalCells: results.totalCells,
    }
  }
  return JSON.stringify(snapshot)
}
