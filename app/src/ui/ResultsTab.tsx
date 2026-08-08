import { breakEvenProbes, dropOneProbes, rankOptions } from '../scoring'
import type { DecisionBundle } from '../queries'
import { Progress } from './bits'
import { pct } from './format'

export default function ResultsTab({
  bundle,
  onGoScore,
}: {
  bundle: DecisionBundle
  onGoScore: () => void
}) {
  const { dimensions, options, scores } = bundle
  const results = rankOptions(dimensions, options, scores)

  if (!results.complete) {
    return (
      <div className="rounded-xl bg-white p-4 shadow-sm">
        <p className="font-medium">No results yet</p>
        <p className="mt-1 text-xs text-slate-500">
          Results appear when every option is scored on every dimension — a partial matrix would
          silently bias the ranking.
        </p>
        {results.totalCells > 0 && (
          <div className="mt-3">
            <div className="mb-1 flex justify-between text-xs text-slate-500">
              <span>
                {results.scoredCells}/{results.totalCells} cells scored
              </span>
            </div>
            <Progress value={results.scoredCells} total={results.totalCells} />
          </div>
        )}
        <button
          type="button"
          className="mt-3 rounded-md bg-sky-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-600"
          onClick={onGoScore}
        >
          Go to scoring
        </button>
      </div>
    )
  }

  const winner = results.winner!
  const runnerUp = results.ranking[1]
  const dimensionById = new Map(dimensions.map((d) => [d.id, d]))
  const optionById = new Map(options.map((o) => [o.id, o]))
  const breakEvens = breakEvenProbes(dimensions, options, scores)
  const drops = dropOneProbes(dimensions, options, scores)

  return (
    <div className="space-y-3">
      <div className="rounded-xl bg-emerald-50 p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-emerald-700">Winner</p>
        <p className="mt-0.5 text-lg font-bold text-emerald-900">
          {winner.option.name} <span className="font-normal">({pct(winner.total)})</span>
        </p>
        <p className="mt-1 text-xs text-emerald-800">
          {runnerUp === undefined
            ? 'The only option — add another to compare.'
            : results.nearTie
              ? `Effectively tied with ${runnerUp.option.name} — margin ${results.margin!.toFixed(2)} (≤ 0.02).`
              : `Margin over ${runnerUp.option.name}: ${results.margin!.toFixed(2)}.`}
        </p>
      </div>

      <ol className="space-y-2">
        {results.ranking.map((r, i) => (
          <li key={r.option.id} className="rounded-xl bg-white p-3 shadow-sm">
            <div className="flex items-baseline justify-between">
              <p className="font-medium">
                <span className="mr-1.5 text-slate-400">{i + 1}.</span>
                {r.option.name}
              </p>
              <span className="text-sm font-semibold text-sky-700">{pct(r.total)}</span>
            </div>
            <div className="mt-2 space-y-1.5">
              {dimensions.map((d) => {
                const cell = r.cells[d.id]
                return (
                  <div key={d.id}>
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-600">
                        {d.name} <span className="text-slate-400">×{d.importance}</span>
                      </span>
                      <span className="text-slate-500">
                        {d.kind === 'objective'
                          ? `${cell.raw}${d.unit ? ` ${d.unit}` : ''}`
                          : `${cell.raw}/5`}
                      </span>
                    </div>
                    <div className="mt-0.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full bg-sky-400"
                        style={{ width: pct(cell.normalized) }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </li>
        ))}
      </ol>

      {results.nonDiscriminating.length > 0 && (
        <div className="rounded-xl bg-amber-50 p-3 text-xs text-amber-800">
          <span className="font-medium">Doesn't separate any options:</span>{' '}
          {results.nonDiscriminating.map((d) => d.name).join(', ')} — every option scores equally
          on {results.nonDiscriminating.length === 1 ? 'it' : 'them'}.
        </div>
      )}

      {results.ranking.length > 1 && (
        <div className="rounded-xl bg-white p-3 shadow-sm">
          <h3 className="text-sm font-medium">How fragile is this?</h3>
          {breakEvens.length === 0 && drops.length === 0 ? (
            <p className="mt-1 text-xs text-slate-500">
              No importance change within 1–5 and no single dropped dimension flips the winner.
            </p>
          ) : (
            <ul className="mt-1 list-disc space-y-1 pl-4 text-xs text-slate-600">
              {breakEvens.map((p) => {
                const d = dimensionById.get(p.dimensionId)!
                return (
                  <li key={`${p.optionId}-${p.dimensionId}`}>
                    If <span className="font-medium">{d.name}</span> had importance ≥{' '}
                    {p.importanceNeeded} (now {d.importance}),{' '}
                    <span className="font-medium">{optionById.get(p.optionId)!.name}</span> would
                    lead.
                  </li>
                )
              })}
              {drops.map((p) => (
                <li key={p.dimensionId}>
                  Drop <span className="font-medium">{dimensionById.get(p.dimensionId)!.name}</span>{' '}
                  and <span className="font-medium">{optionById.get(p.newWinnerId)!.name}</span>{' '}
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
