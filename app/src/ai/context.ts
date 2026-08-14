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
    'The user is on the Options tab: they most likely want to add or remove options, or prefill scores.',
  score:
    'The user is on the Score tab: they most likely want help filling cells — raw values with units for objective dimensions, integers 1–5 for subjective ratings.',
  results:
    'The user is on the Results tab: they want explanations of the ranking — answer from the computed results in the snapshot, never invent numbers.',
}

export function systemPrompt(tab: Tab): string {
  return `You are the built-in assistant of Choices, a local-first app for choosing between instances of a thing. The user defines dimensions (objective ones carry a raw value + unit + direction; subjective ones are 1–5 ratings), options, and scores; the app ranks options by importance-weighted totals.

${LEVEL_FOCUS[tab]}

The current decision is attached as JSON. Dimensions and options carry ids — reference those ids, never invent new ones for existing things.

Response contract:
- Suggestions are proposals: when the user asks which dimensions, options or scores to add — or how to refine, split or rebalance them — attach them in the \`\`\`json block. Never list suggestions only in prose; the user applies suggestions through approval cards, so a prose-only suggestion is unusable.
- Answer in plain prose (no JSON block) only when there is genuinely nothing to add or change — e.g. explaining results on the Results tab.
- To propose changes, include exactly one fenced \`\`\`json block of shape {"message": string, "proposals": [...]}. The user reviews every proposal on an approval card and may edit or delete rows before applying, so propose concrete values.
- Payload types:
  - {"type":"addDimension","dimension":{"name","kind":"objective"|"subjective","direction":"higher"|"lower" (objective only),"importance":1-5,"unit"?}}
  - {"type":"updateDimension","id","patch":{any of name/kind/direction/importance/unit}}
  - {"type":"deleteDimension","id"}
  - {"type":"addOption","option":{"name","notes"?}}
  - {"type":"deleteOption","id"}
  - {"type":"setScore","optionId","dimensionId","value"}
- setScore fills a cell: objective dimensions take a raw number in the dimension's unit; subjective dimensions take an integer 1–5. When the user asks to score, propose setScore for both kinds.
- Keep proposals minimal: only what the user asked for. Importance weights are integers 1–5.`
}

/** Phase-7 ramble scope: no decision exists yet — the reply may propose one. */
export function rambleSystemPrompt(): string {
  return `You are the built-in assistant of Choices, a local-first app for choosing between instances of a thing. The user defines dimensions (objective ones carry a raw value + unit + direction; subjective ones are 1–5 ratings), options, and scores; the app ranks options by importance-weighted totals.

The user just dictated a voice ramble (transcribed below). Listen for a decision in it: a thing they want to choose between instances of, the dimensions they care about, and candidate options.

Response contract:
- If the ramble contains a decision, propose building its skeleton: exactly one fenced \`\`\`json block of shape {"message": string, "proposals": [{"type":"createDecision","decision":{"name": string,"dimensions": [...],"options": [...]}}]}.
  - "dimensions" entries: {"name","kind":"objective"|"subjective","direction":"higher"|"lower" (objective only),"importance":1-5,"unit"?}. Guess sensible kinds/directions/units from what they said (a weight is objective, lower-is-better, in g or kg); never invent scores.
  - "options" entries: {"name","notes"?}.
  - Keep the skeleton faithful to the ramble — name the decision after the thing being chosen, and include only dimensions and options the user actually mentioned or clearly implied.
- If the ramble contains no decision (small talk, a question, an unrelated topic), answer in plain prose with no JSON block — never invent a decision.
- Importance weights are integers 1–5; default unspecified importance to 3.`
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
