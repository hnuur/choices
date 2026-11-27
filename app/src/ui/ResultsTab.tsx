import { breakEvenProbes, dropOneProbes, rankOptions } from '../scoring'
import type { DecisionBundle } from '../queries'
import type { Dimension } from '../types'
import { dimensionScale, formatLabels } from '../units'
import { Progress } from './bits'
import { pct } from './format'

// Bars are relative to the best value in the dimension (best = full width),
// not the engine's set-relative min-max, which paints every dimension leader
// full width. Subjective scales top out at 5; objective at the best raw value
// (min for lower-better).
function barFraction(d: Dimension, raw: number, raws: number[]): number {
  const clamp = (x: number) => Math.min(1, Math.max(0, x))
  if (dimensionScale(d) === 'rating') return clamp(raw / 5)
  if (d.direction === 'lower') {
    const min = Math.min(...raws)
    if (raw === 0) return min === 0 ? 1 : 0
    return clamp(min / raw)
  }
  const max = Math.max(...raws)
  if (max === 0) return 1
  return clamp(raw / max)
}

export default function ResultsTab({
  bundle,
  onGoScore,
}: {
  bundle: DecisionBundle
  onGoScore: () => void
}) {
  const { dimensions, options, scores } = bundle
  const results = rankOptions(dimensions, options, scores)

  if (!results.complete || results.ranking.length === 0) {
    return (
      <div className="surface-card">
        <h3 className="section-title">No results yet</h3>
        <p className="mt-2 max-w-prose text-sm text-ink-2">
          Score each option on every dimension to see the ranking.
        </p>
        {results.totalCells > 0 && (
          <div className="mt-3">
            <div className="mb-2 text-sm text-ink-3">
              <span>
                {results.scoredCells} of {results.totalCells} scored
              </span>
            </div>
            <Progress value={results.scoredCells} total={results.totalCells} />
          </div>
        )}
        <button
          type="button"
          className="primary-action mt-4"
          onClick={onGoScore}
        >
          Go to scoring
        </button>
      </div>
    )
  }

  const winner = results.winner!
  const runnerUp = results.ranking[1]
  const [first, ...rest] = results.ranking
  const rawsByDim = new Map(
    dimensions.map((d) => [d.id, results.ranking.map((r) => r.cells[d.id].raw)]),
  )
  const dimensionById = new Map(dimensions.map((d) => [d.id, d]))
  const optionById = new Map(options.map((o) => [o.id, o]))
  const breakEvens = breakEvenProbes(dimensions, options, scores)
  const drops = dropOneProbes(dimensions, options, scores)

  const winnerLine =
    runnerUp === undefined
      ? `${winner.option.name} — the only option`
      : results.nearTie
        ? `${winner.option.name} — effectively tied with ${runnerUp.option.name} (margin ${results.margin!.toFixed(2)})`
        : `${winner.option.name} by ${results.margin!.toFixed(2)} over ${runnerUp.option.name}`

  return (
    <div className="space-y-3">
      <div className="surface-card bg-accent-soft">
        <span className="block text-sm font-semibold text-accent-ink">
          {results.nearTie ? 'Near tie' : runnerUp ? 'Winner' : 'Only option'}
        </span>
        <p className="mt-1 text-base font-medium text-ink">{winnerLine}</p>
      </div>

      <div className="surface-card">
        <div className="flex items-center gap-2.5">
          <span className="shrink-0 text-sm tabular-nums text-ink-3">1</span>
          <h3 className="section-title min-w-0 flex-1">{first.option.name}</h3>
          <span className="shrink-0 text-xl font-semibold tabular-nums text-accent-ink">
            {pct(first.total)}
          </span>
        </div>

        <div className="mt-4 space-y-3">
          {dimensions.map((d) => {
            const cell = first.cells[d.id]
            const scale = dimensionScale(d)
            return (
              <div key={d.id}>
                <div className="flex flex-wrap justify-between gap-x-3 gap-y-1 text-sm">
                  <span className="text-ink-2">{d.name}</span>
                  <span className="min-w-0 text-right text-ink-2">
                    {scale === 'nominal'
                      ? formatLabels(cell.labels ?? [])
                      : scale === 'numeric'
                        ? `${cell.raw}${d.unit ? ` ${d.unit}` : ''}`
                        : `${cell.raw}/5`}
                  </span>
                </div>
                {scale !== 'nominal' && (
                  <div
                    role="img"
                    aria-label={`${d.name}: ${pct(barFraction(d, cell.raw, rawsByDim.get(d.id)!))} of best value. Importance ${d.importance} of 5.`}
                    className="mt-1.5 w-full overflow-hidden rounded-full bg-divider"
                    style={{ height: `${1 + d.importance}px` }}
                  >
                    <div
                      className="h-full rounded-full bg-accent"
                      style={{
                        width: pct(barFraction(d, cell.raw, rawsByDim.get(d.id)!)),
                        opacity: 0.5 + d.importance * 0.1,
                      }}
                    />
                  </div>
                )}
              </div>
            )
          })}
        </div>

        <p className="mt-4 border-t border-divider pt-3 text-xs text-ink-3">
          Bar length shows the score relative to the best option. Thicker bars indicate more importance.
        </p>
      </div>

      <ol aria-label="Other ranked options" className="space-y-2">
        {rest.map((r, i) => (
          <li
            key={r.option.id}
            className="surface-card flex min-h-14 flex-wrap items-center gap-x-3 gap-y-1"
          >
            <span className="w-4 shrink-0 text-sm tabular-nums text-ink-3">{i + 2}</span>
            <span className="min-w-0 flex-1 font-medium">{r.option.name}</span>
            <span aria-hidden="true" className="hidden h-1 max-w-44 flex-1 overflow-hidden rounded-full bg-divider sm:block">
              <span
                className="block h-full rounded-full bg-bar-dim"
                style={{ width: pct(r.total) }}
              />
            </span>
            <span className="shrink-0 text-sm font-semibold text-ink-2">{pct(r.total)}</span>
          </li>
        ))}
      </ol>

      {results.categorical.length > 0 && (
        <div className="surface-card text-sm text-ink-2">
          <span className="font-medium text-ink">Recorded, not ranked:</span>{' '}
          {results.categorical.map((d) => d.name).join(', ')} — categories aren't a higher/lower
          scale, so they don't change the total.
        </div>
      )}

      {results.nonDiscriminating.length > 0 && (
        <div className="surface-card text-sm text-ink-2">
          <span className="font-medium text-ink">Doesn't separate any options:</span>{' '}
          {results.nonDiscriminating.map((d) => d.name).join(', ')} — every option scores equally
          on {results.nonDiscriminating.length === 1 ? 'it' : 'them'}.
        </div>
      )}

      {results.ranking.length > 1 && (
        <div className="surface-card">
          <h3 className="text-sm font-medium">How fragile is this?</h3>
          {breakEvens.length === 0 && drops.length === 0 ? (
            <p className="mt-2 max-w-prose text-sm text-ink-2">
              No importance change within 1–5 and no single dropped dimension flips the winner.
            </p>
          ) : (
            <ul className="mt-2 list-disc space-y-2 pl-5 text-sm text-ink-2">
              {breakEvens.map((p) => {
                const d = dimensionById.get(p.dimensionId)!
                return (
                  <li key={`${p.optionId}-${p.dimensionId}`}>
                    If <span className="font-medium text-ink">{d.name}</span> had importance ≥{' '}
                    {p.importanceNeeded} (now {d.importance}),{' '}
                    <span className="font-medium text-ink">
                      {optionById.get(p.optionId)!.name}
                    </span>{' '}
                    would lead.
                  </li>
                )
              })}
              {drops.map((p) => (
                <li key={p.dimensionId}>
                  Drop{' '}
                  <span className="font-medium text-ink">
                    {dimensionById.get(p.dimensionId)!.name}
                  </span>{' '}
                  and{' '}
                  <span className="font-medium text-ink">
                    {optionById.get(p.newWinnerId)!.name}
                  </span>{' '}
                  wins.
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
