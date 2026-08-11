import { breakEvenProbes, dropOneProbes, rankOptions } from '../scoring'
import type { DecisionBundle } from '../queries'
import type { Dimension } from '../types'
import { Progress } from './bits'
import { pct } from './format'

// Bars are relative to the best value in the dimension (best = full width),
// not the engine's set-relative min-max, which paints every dimension leader
// full width. Subjective scales top out at 5; objective at the best raw value
// (min for lower-better).
function barFraction(d: Dimension, raw: number, raws: number[]): number {
  const clamp = (x: number) => Math.min(1, Math.max(0, x))
  if (d.kind === 'subjective') return clamp(raw / 5)
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
      <div className="rounded-xl border border-hairline bg-surface p-4">
        <p className="font-medium">No results yet</p>
        <p className="mt-1 text-xs text-ink-3">
          Results appear when every option is scored on every dimension — a partial matrix would
          silently bias the ranking.
        </p>
        {results.totalCells > 0 && (
          <div className="mt-3">
            <div className="mb-1 flex justify-between font-mono text-[10.5px] uppercase tracking-[0.1em] text-ink-3">
              <span>
                {results.scoredCells}/{results.totalCells} cells scored
              </span>
            </div>
            <Progress value={results.scoredCells} total={results.totalCells} />
          </div>
        )}
        <button
          type="button"
          className="mt-3 min-h-11 rounded-xl bg-accent px-4 text-sm font-semibold text-on-accent"
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
      <div className="flex items-center gap-3 rounded-xl border border-accent/15 bg-accent/8 px-4 py-3">
        <span className="shrink-0 font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-accent-ink">
          Winner
        </span>
        <p className="min-w-0 truncate text-[15px] text-ink-2">{winnerLine}</p>
      </div>

      <div className="rounded-2xl border border-hairline bg-surface p-4">
        <div className="flex items-center gap-2.5">
          <span className="shrink-0 font-mono text-sm text-ink-4">1</span>
          <h2 className="min-w-0 flex-1 truncate text-xl font-bold">{first.option.name}</h2>
          {runnerUp !== undefined && (
            <span className="shrink-0 rounded-md bg-accent px-2 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-on-accent">
              Win
            </span>
          )}
          <span className="shrink-0 text-xl font-semibold text-accent-ink">
            {pct(first.total)}
          </span>
        </div>

        <div className="mt-4 space-y-3">
          {dimensions.map((d) => {
            const cell = first.cells[d.id]
            return (
              <div key={d.id}>
                <div className="flex justify-between text-[15px]">
                  <span className="text-ink-2">{d.name}</span>
                  <span className="text-ink-2">
                    {d.kind === 'objective'
                      ? `${cell.raw}${d.unit ? ` ${d.unit}` : ''}`
                      : `${cell.raw}/5`}
                  </span>
                </div>
                <div
                  className="mt-1.5 w-full overflow-hidden rounded-full bg-hairline"
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
              </div>
            )
          })}
        </div>

        <p className="mt-4 border-t border-hairline pt-3 font-mono text-[10.5px] uppercase tracking-[0.1em] text-ink-4">
          Bar = score in dimension · thickness = weight
        </p>
      </div>

      <ol className="space-y-2">
        {rest.map((r, i) => (
          <li
            key={r.option.id}
            className="flex min-h-14 items-center gap-3 rounded-xl border border-hairline bg-surface-2 px-4"
          >
            <span className="w-4 shrink-0 font-mono text-sm text-ink-4">{i + 2}</span>
            <span className="min-w-0 flex-1 truncate font-medium">{r.option.name}</span>
            <span className="h-[3px] max-w-44 flex-1 overflow-hidden rounded-full bg-hairline">
              <span
                className="block h-full rounded-full bg-bar-dim"
                style={{ width: pct(r.total) }}
              />
            </span>
            <span className="shrink-0 text-sm font-semibold text-ink-2">{pct(r.total)}</span>
          </li>
        ))}
      </ol>

      {results.nonDiscriminating.length > 0 && (
        <div className="rounded-xl border border-hairline bg-surface p-3 text-xs text-ink-2">
          <span className="font-medium text-ink">Doesn't separate any options:</span>{' '}
          {results.nonDiscriminating.map((d) => d.name).join(', ')} — every option scores equally
          on {results.nonDiscriminating.length === 1 ? 'it' : 'them'}.
        </div>
      )}

      {results.ranking.length > 1 && (
        <div className="rounded-xl border border-hairline bg-surface p-3">
          <h3 className="text-sm font-medium">How fragile is this?</h3>
          {breakEvens.length === 0 && drops.length === 0 ? (
            <p className="mt-1 text-xs text-ink-3">
              No importance change within 1–5 and no single dropped dimension flips the winner.
            </p>
          ) : (
            <ul className="mt-1 list-disc space-y-1 pl-4 text-xs text-ink-2">
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
