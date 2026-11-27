// Option-by-option scoring cards (PLAN.md locked decision: not a grid).

import { useEffect, useState } from 'react'
import { clearScore, setScore } from '../mutations'
import type { DecisionBundle } from '../queries'
import { cellIsScored, rankOptions } from '../scoring'
import type { Dimension, Score } from '../types'
import { dimensionScale, unitPresets } from '../units'
import { LabelPicker, Progress, inputClass } from './bits'

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
        aria-label={dimension.unit ? `${dimension.name} in ${dimension.unit}` : dimension.name}
        className={`${inputClass} max-w-40`}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur()
        }}
      />
      {dimension.unit && <span className="max-w-[35%] shrink-0 text-sm text-ink-3">{dimension.unit}</span>}
    </div>
  )
}

function NominalCell({
  optionId,
  dimension,
  score,
  suggestions,
}: {
  optionId: string
  dimension: Dimension
  score: Score | undefined
  suggestions: string[]
}) {
  const labels = score?.labels ?? []
  return (
    <LabelPicker
      value={labels}
      suggestions={suggestions}
      placeholder={`Add ${dimension.unit || dimension.name.toLowerCase()}`}
      onChange={(next) => {
        if (next.length === 0) void clearScore(optionId, dimension.id)
        else void setScore(optionId, dimension.id, next)
      }}
    />
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
    <div>
      <div className="segmented" role="group" aria-label={`Rate ${dimension.name} from 1 to 5`}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            aria-pressed={score?.value === n}
            onClick={() => void setScore(optionId, dimension.id, n)}
            className="tabular-nums"
          >
            {n}
          </button>
        ))}
      </div>
      {score && (
        <button
          type="button"
          className="text-action"
          aria-label={`Clear ${dimension.name} rating`}
          onClick={() => void clearScore(optionId, dimension.id)}
        >
          Clear
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

  const suggestionsFor = (d: Dimension) => {
    const used = scores.flatMap((s) => (s.dimensionId === d.id ? (s.labels ?? []) : []))
    const seen = new Set<string>()
    const out: string[] = []
    for (const label of [...unitPresets(d), ...used]) {
      const key = label.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      out.push(label)
    }
    return out
  }

  if (dimensions.length === 0 || options.length === 0) {
    return (
      <p className="surface-card text-ink-2">
        Add at least one dimension and one option before scoring.
      </p>
    )
  }

  return (
    <div className="grid items-start gap-3 md:grid-cols-2">
      <div className="surface-card md:col-span-2">
        <div className="mb-2 flex flex-wrap justify-between gap-x-3 text-sm">
          <span className="font-semibold">Scoring progress</span>
          <span>
            {results.scoredCells} of {results.totalCells} scored
          </span>
        </div>
        <Progress value={results.scoredCells} total={results.totalCells} />
        {results.complete && (
          <p className="mt-2 text-sm font-medium text-accent-ink">All options scored. Results are ready.</p>
        )}
      </div>

      {options.map((option) => (
        <section key={option.id} className="surface-card">
          <h3 className="section-title">{option.name}</h3>
          {option.notes && (
            <p className="mt-1 whitespace-pre-wrap text-sm text-ink-2">{option.notes}</p>
          )}
          <ul className="mt-2 space-y-3">
            {dimensions.map((d) => {
              const score = scoreFor(option.id, d.id)
              const scale = dimensionScale(d)
              const filled = cellIsScored(d, score)
              const scaleHint = scale === 'rating' ? '1–5 rating'
                : scale === 'numeric' && d.direction === 'lower' ? 'Lower is better' : ''
              const scoreStatus = [scaleHint, filled ? '' : 'Unscored'].filter(Boolean).join(' · ')
              return (
                <li key={d.id} className="border-t border-divider pt-3">
                  <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1">
                    <span className="text-sm font-semibold">{d.name}</span>
                    {scoreStatus && <span className="text-xs text-ink-3">{scoreStatus}</span>}
                  </div>
                  {scale === 'nominal' ? (
                    <NominalCell
                      optionId={option.id}
                      dimension={d}
                      score={score}
                      suggestions={suggestionsFor(d)}
                    />
                  ) : scale === 'numeric' ? (
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
