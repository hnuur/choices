// Option-by-option scoring cards (PLAN.md locked decision: not a grid).

import { useEffect, useState } from 'react'
import { clearScore, setScore } from '../mutations'
import type { DecisionBundle } from '../queries'
import { rankOptions } from '../scoring'
import type { Dimension, Score } from '../types'
import { Progress, inputClass } from './bits'

function ObjectiveCell({
  optionId,
  dimension,
  score,
}: {
  optionId: string
  dimension: Dimension
  score: Score | undefined
}) {
  const [text, setText] = useState(score === undefined ? '' : String(score.value))
  useEffect(() => {
    setText(score === undefined ? '' : String(score.value))
  }, [score?.value])

  const commit = () => {
    if (text.trim() === '') {
      if (score) void clearScore(optionId, dimension.id)
      return
    }
    const value = Number(text)
    if (!Number.isFinite(value)) {
      setText(score === undefined ? '' : String(score.value))
      return
    }
    void setScore(optionId, dimension.id, value)
  }

  return (
    <div className="flex items-center gap-2">
      <input
        type="number"
        inputMode="decimal"
        className={inputClass}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur()
        }}
      />
      {dimension.unit && <span className="shrink-0 text-sm text-ink-3">{dimension.unit}</span>}
    </div>
  )
}

function SubjectiveCell({
  optionId,
  dimension,
  score,
}: {
  optionId: string
  dimension: Dimension
  score: Score | undefined
}) {
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => void setScore(optionId, dimension.id, n)}
          className={`h-11 flex-1 rounded-md text-sm font-medium ${
            score?.value === n
              ? 'bg-accent font-semibold text-on-accent'
              : 'bg-hover text-ink-2 hover:bg-white/9'
          }`}
        >
          {n}
        </button>
      ))}
      {score && (
        <button
          type="button"
          className="h-11 shrink-0 rounded-md px-2 text-xs text-ink-4 hover:bg-hover"
          onClick={() => void clearScore(optionId, dimension.id)}
        >
          ✕
        </button>
      )}
    </div>
  )
}

export default function ScoreTab({ bundle }: { bundle: DecisionBundle }) {
  const { dimensions, options, scores } = bundle
  const results = rankOptions(dimensions, options, scores)
  const scoreFor = (optionId: string, dimensionId: string) =>
    scores.find((s) => s.optionId === optionId && s.dimensionId === dimensionId)

  if (dimensions.length === 0 || options.length === 0) {
    return (
      <p className="rounded-xl border border-hairline bg-surface p-4 text-sm text-ink-3">
        Add at least one dimension and one option before scoring.
      </p>
    )
  }

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-hairline bg-surface p-3">
        <div className="mb-1.5 flex justify-between font-mono text-[10.5px] uppercase tracking-[0.1em] text-ink-3">
          <span>Score matrix</span>
          <span>
            {results.scoredCells}/{results.totalCells} cells
          </span>
        </div>
        <Progress value={results.scoredCells} total={results.totalCells} />
        {results.complete && (
          <p className="mt-1.5 text-xs text-accent-ink">Matrix complete — results are live.</p>
        )}
      </div>

      {options.map((option) => (
        <section key={option.id} className="rounded-xl border border-hairline bg-surface p-3">
          <h3 className="font-medium">{option.name}</h3>
          {option.notes && (
            <p className="mt-0.5 whitespace-pre-wrap text-xs text-ink-3">{option.notes}</p>
          )}
          <ul className="mt-2 space-y-3">
            {dimensions.map((d) => {
              const score = scoreFor(option.id, d.id)
              return (
                <li key={d.id}>
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="text-ink-2">
                      {d.name}
                      {d.kind === 'objective' && d.direction === 'lower' && (
                        <span className="text-ink-4"> (lower is better)</span>
                      )}
                    </span>
                    <span className={score ? 'text-accent-ink' : 'text-ink-4'}>
                      {score ? '●' : '○'}
                    </span>
                  </div>
                  {d.kind === 'objective' ? (
                    <ObjectiveCell optionId={option.id} dimension={d} score={score} />
                  ) : (
                    <SubjectiveCell optionId={option.id} dimension={d} score={score} />
                  )}
                </li>
              )
            })}
          </ul>
        </section>
      ))}
    </div>
  )
}
