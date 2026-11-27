// Conversation context per PLAN.md Phase-6: each message carries a snapshot
// of the decision (stateless, small) plus a system prompt describing the
// response contract. The snapshot is the only decision data that leaves the
// device — disclosed in AI settings, nowhere else.

import type { DecisionBundle } from '../queries'
import { cellIsScored, rankOptions, NEAR_TIE_MARGIN } from '../scoring'
import type { Tab } from '../ui/tabs'
import { dimensionScale } from '../units'

const SCORE_FILL_RULE = `SCORE FILL HARD RULE: When the user asks to score, fill, rate, prefill, update, research-and-score, cover missing cells, or otherwise set cell values — including on the first message and follow-ups like "you missed some" — your reply MUST include a \`\`\`json block with setScore proposals. If they asked for all / everything / the whole matrix (or did not narrow the scope), emit exactly one setScore for EVERY entry in snapshot.unscored (count them: if unscored has N items, proposals must contain N setScore rows — no fewer). If they named specific options or dimensions, cover every unscored cell in that subset. Proposing IS the action: never wait for "do it" or a second turn. Never answer with prose-only per-option writeups — the user approves scores on a card. Keep "message" to one short sentence; put every value in setScore rows only. Prefer many small complete setScore objects over one giant unfinished reply — a truncated mid-object dump is unusable. If web lookup is on, research first then still finish with setScore proposals in the same reply. An open approval card does NOT block a better replacement.

Exceptions (plain prose, NO json block):
- snapshot.unscored is [] (matrix already full) — say all cells are scored; do not re-propose scores.
- Status questions only ("have all been scored?", "is it complete?", "what's missing?") — answer from results.complete / unscored.length / missingCount; do not emit setScore unless they also ask you to fill.`

const LEVEL_FOCUS: Record<Tab, string> = {
  dimensions:
    'The user is on the Dimensions tab: they most likely want to add, refine, split, rebalance (importance) or remove dimensions. If they ask to score or fill cells, follow SCORE FILL HARD RULE.',
  options:
    'The user is on the Options tab: they most likely want to add or remove options, or prefill scores. If they ask to score or prefill scores, follow SCORE FILL HARD RULE — setScore proposals in the json block on the first turn, not prose-only ratings.',
  score:
    'The user is on the Score tab: they want cells filled or to know what is left. Fill requests follow SCORE FILL HARD RULE; status-only questions stay prose (see Exceptions).',
  results:
    'The user is on the Results tab: they want explanations of the ranking — answer from the computed results in the snapshot, never invent numbers. Status about completeness stays prose. Only if they ask to fill missing scores, follow SCORE FILL HARD RULE.',
}

// Hard rule for place recommendations — always on (not only under
// web lookup). Web search returns rich place cards; without an
// explicit format the model pastes them into prose, and "cite by
// URL" made that worse.
const PLACE_LIST_RULE = `HARD RULE for places (restaurants, shops, venues) — in prose AND in option name/notes: each place is exactly "Name — one sentence why it is good." Nothing else on that line. Forbidden: street address, neighborhood, city, postal/ZIP, phone, website/URL (including Maps links and utm tracking), star ratings, review counts, open/closed status, price ranges, and markdown (no **, _, or [text](url)). Do not paste search-result cards. Prefer a short bullet list over paragraphs.`

const LOOKUP_GUIDANCE = `
Web lookup is on. When the user asks for an objective fact (price, weight, spec, date), look it up. Omit a cell rather than invent a number you did not find. Subjective 1–5 ratings are judgement, not a web result. When the user asks to research and score, look up what you need then still finish with setScore proposals in the same reply — never stop at a research essay. ${PLACE_LIST_RULE} For place recommendations, never cite per-place websites or Maps links. Other factual sources (articles, specs sheets) may be named once at the end by publication title only — no URLs next to place names. Proposals still use the same JSON contract.`

const GUIDED_TURN = `Hands-free voice is active. Speak conversationally in short paragraphs. Ask one focused question at a time. Let the user change topic or direct the pace. When attaching proposals, keep the reply short and end the turn without another question. The app separately reads back the exact proposed changes and accepts "save changes" or "discard changes." Wait for the app to report what happened. Never say changes were saved until the app confirms it.`

const GUIDED_DECISION = `Guide the user through the entire choice regardless of the selected tab. Start with the next missing step in the snapshot: define the options and decision criteria, confirm importance (1–5), then work through missing scores one dimension or option at a time. Ask how the alternatives compare and ground subjective ratings in what they tell you. Propose only values they supplied or agreed to. Keep existing scores unless they request an edit, and support edits even when the matrix is complete. Use the published scale for each score. When the matrix is complete, explain the actual ranking, result margin and trade-offs, and offer to review a weight or score. Do not give a winner with an incomplete matrix. After a save or discard, continue from the fresh snapshot with one next question or a short results explanation.`

const VOICE_HINT = 'If asked to work aloud, tell the user to turn on Hands-free. Never assume spoken replies mean the microphone is listening.'

export function systemPrompt(tab: Tab, webLookup = false, guided = false): string {
  return `You are the built-in assistant of Choices, a local-first app for choosing between instances of a thing. The user defines dimensions (objective numeric ones carry a raw value + unit + direction; objective categorical ones like genre carry one or more labels; subjective ones are 1–5 ratings), options, and scores; the app ranks options by importance-weighted totals. Categorical cells fill the matrix but do not change the ranking.

${guided ? `${GUIDED_TURN}\n\n${GUIDED_DECISION}` : `${LEVEL_FOCUS[tab]}\n\n${VOICE_HINT}`}

The current decision is attached as JSON. Dimensions and options carry ids — reference those ids, never invent new ones for existing things. When results.complete is false, snapshot.unscored lists every empty cell (optionId, dimensionId, names, scale) — use that list when filling scores.

Response contract:
- ${guided ? 'Ask for missing information in prose. Once the user provides a change or rating, attach its proposal in the same reply. Do not fill cells ahead of the conversation.' : 'When the user asks which dimensions, options or scores to add, refine, split or rebalance, attach concrete proposals in the JSON block on the first turn.'}
- Answer in plain prose (no JSON block) only when there is genuinely nothing to add or change — e.g. explaining results on the Results tab, or clarifying a question that is not a request to change the decision.
- To propose changes, include exactly one fenced \`\`\`json block of shape {"message": string, "proposals": [...]}. The user reviews every proposal on an approval card and may edit or delete rows before applying, so propose concrete values.
- Payload types:
  - {"type":"renameDecision","name":"new decision name"}
  - {"type":"addDimension","dimension":{"name","kind":"objective"|"subjective","direction":"higher"|"lower" (numeric objective only),"importance":1-5,"unit"?}}
  - {"type":"updateDimension","id","patch":{any of name/kind/direction/importance/unit}}
  - {"type":"deleteDimension","id"}
  - {"type":"addOption","option":{"name","notes"?}}. For places, name is the place name; notes are the one-sentence blurb only.
  - {"type":"updateOption","id","patch":{"name"?,"notes"?}}. Use null for notes to clear them.
  - {"type":"deleteOption","id"}
  - {"type":"setScore","optionId","dimensionId","value"?,"labels"?}
- setScore fills a cell. Copy optionId and dimensionId from the snapshot — each option has its own id; never reuse one option's id on another. Match the dimension's "scale":
  - "numeric": raw number in \`value\` only (omit labels)
  - "rating": integer 1–5 in \`value\` only (omit labels)
  - "nominal": one or more strings in \`labels\` only (omit value). Never a 1–5 rating for genre or other categories.
  Exactly one of value or labels — never both, never neither. Every setScore MUST include the actual number or labels — never an empty cell.
- Judgement dimensions (reliability, feel, snow performance, …) are kind:"subjective" with NO unit — never unit:"rating" / "1-5" / "stars" on an objective dimension. Categorical facts use objective + a category unit (genre, cuisine, …).
- Keep proposals minimal: only what the user asked for. Importance weights are integers 1–5.
- ${PLACE_LIST_RULE}${webLookup ? LOOKUP_GUIDANCE : ''}
- ${guided ? 'An answer that covers one cell may propose just that cell. Clarify when the answer is ambiguous.' : SCORE_FILL_RULE}`
}

/** Phase-7 ramble scope: no decision exists yet — the reply may propose one. */
export function rambleSystemPrompt(webLookup = false, guided = false): string {
  return `You are the built-in assistant of Choices, a local-first app for choosing between instances of a thing. The user defines dimensions (objective numeric ones carry a raw value + unit + direction; objective categorical ones like genre carry one or more labels; subjective ones are 1–5 ratings), options, and scores; the app ranks options by importance-weighted totals. Categorical cells fill the matrix but do not change the ranking.

The user is describing a decision they want to make (typed or a voice ramble). Listen for the type of thing, the dimensions they care about, candidate options, and any facts or judgements that can become scores.

${guided ? `${GUIDED_TURN} Help define the decision and its initial options and criteria. Ask a clarifying question when something essential is missing. Let the user talk through changes to the draft before saving. Only score what they agreed to.` : VOICE_HINT}

Response contract:
- If the input contains a decision, propose building it: exactly one fenced \`\`\`json block of shape {"message": string, "proposals": [{"type":"createDecision","decision":{"name": string,"dimensions": [...],"options": [...],"scores": [...]}}]}.
  - "dimensions" entries: {"name","kind":"objective"|"subjective","direction":"higher"|"lower" (numeric objective only),"importance":1-5,"unit"?}. Guess sensible kinds/directions/units from what they said (a weight is objective, lower-is-better, in g or kg; genre is objective with unit "genre" and no direction; reliability / feel / snow performance are subjective with no unit — never unit:"rating").
  - "options" entries: {"name","notes"?}. For places, name is the place name; notes are the one-sentence blurb only.
  - "scores" entries: {"option":"<option name>","dimension":"<dimension name>","value": number} or {"option","dimension","labels":["…"]}. Use the same names as above. Exactly one of value or labels — never both. Numeric objective values are raw numbers in the dimension's unit; subjective values are integers 1–5; categorical dimensions (genre, cuisine, brand) use labels only, never a 1–5 rating. ${guided ? 'Only include cells the user supplied or agreed to.' : 'Fill every cell you reasonably can and omit a cell rather than inventing a precise fact you cannot support.'} Partial matrices are OK.
  - Keep the skeleton faithful to what they said — name the decision after the thing being chosen, and include only dimensions and options they mentioned or clearly implied.
  - The message should briefly say what you filled and what you guessed. Do not tell them to copy JSON; they will choose Fill in what you can or Keep chatting in the app.
- If they are refining a proposal already on the card, emit a full replacement createDecision (not a patch) that incorporates their follow-up.
- If the input contains no decision (small talk, a question, an unrelated topic), answer in plain prose with no JSON block — never invent a decision.
- Importance weights are integers 1–5; default unspecified importance to 3.
- ${PLACE_LIST_RULE}${webLookup ? LOOKUP_GUIDANCE : ''}`
}

interface Snapshot {
  decision: { id: string; name: string }
  dimensions: unknown[]
  options: unknown[]
  scores: { optionId: string; dimensionId: string; value?: number; labels?: string[] }[]
  /** Empty cells the model must cover when the user asks to fill/score all. */
  unscored: {
    optionId: string
    dimensionId: string
    option: string
    dimension: string
    scale: string
  }[]
  results?: unknown
}

export function decisionSnapshot(bundle: DecisionBundle): string {
  const results = rankOptions(bundle.dimensions, bundle.options, bundle.scores)
  const byCell = new Map(bundle.scores.map((s) => [`${s.optionId}\0${s.dimensionId}`, s]))
  const unscored = bundle.options.flatMap((o) =>
    bundle.dimensions
      .filter((d) => !cellIsScored(d, byCell.get(`${o.id}\0${d.id}`)))
      .map((d) => ({
        optionId: o.id,
        dimensionId: d.id,
        option: o.name,
        dimension: d.name,
        scale: dimensionScale(d),
      })),
  )
  const snapshot: Snapshot = {
    decision: { id: bundle.decision.id, name: bundle.decision.name },
    dimensions: bundle.dimensions.map((d) => ({
      id: d.id,
      name: d.name,
      kind: d.kind,
      scale: dimensionScale(d),
      ...(d.kind === 'objective' ? { direction: d.direction ?? null, unit: d.unit ?? null } : {}),
      importance: d.importance,
    })),
    options: bundle.options.map((o) => ({ id: o.id, name: o.name, notes: o.notes ?? null })),
    scores: bundle.scores.map((s) => ({
      optionId: s.optionId,
      dimensionId: s.dimensionId,
      ...(s.labels ? { labels: s.labels } : { value: s.value }),
    })),
    unscored,
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
      complete: true,
      scoredCells: results.scoredCells,
      totalCells: results.totalCells,
    }
  } else {
    snapshot.results = {
      complete: false,
      scoredCells: results.scoredCells,
      totalCells: results.totalCells,
      missingCount: unscored.length,
    }
  }
  return JSON.stringify(snapshot)
}
