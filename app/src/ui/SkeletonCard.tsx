// Ramble approval card per PLAN.md Phase-7: the whole proposed decision
// skeleton as editable rows — same mechanics as the Phase-6 card. Fill in
// applies exactly what is on the card; Keep chatting leaves it open so the
// sheet can refine it. Closing the sheet without filling in writes nothing.

import { useState } from 'react'
import type { DecisionSkeletonInput, SkeletonScoreInput } from '../types'
import { dimensionScale, unitPresets } from '../units'
import { DimensionFields } from './ApprovalCard'
import { ImportancePicker, LabelPicker, inputClass } from './bits'

export type SkeletonOutcome = { error: string }

const smallSelect =
  'w-full rounded-lg border border-hairline bg-surface-2 px-2 py-2.5 text-sm text-ink focus:border-accent focus:outline-none'

function dimOf(skeleton: DecisionSkeletonInput, name: string) {
  return skeleton.dimensions.find((d) => d.name.trim().toLowerCase() === name.trim().toLowerCase())
}

export default function SkeletonCard({
  initial,
  onApply,
  onKeepChatting,
  onChange,
  outcome,
}: {
  initial: DecisionSkeletonInput
  onApply: (skeleton: DecisionSkeletonInput) => void
  onKeepChatting: () => void
  onChange?: (skeleton: DecisionSkeletonInput) => void
  /** Present after a failed apply (the card stays editable then). */
  outcome?: SkeletonOutcome
}) {
  const [skeleton, setSkeleton] = useState<DecisionSkeletonInput>(initial)
  const patch = (next: DecisionSkeletonInput | ((s: DecisionSkeletonInput) => DecisionSkeletonInput)) => {
    setSkeleton((s) => {
      const resolved = typeof next === 'function' ? next(s) : next
      onChange?.(resolved)
      return resolved
    })
  }

  const scores = skeleton.scores ?? []

  const setDimension = (index: number, dimension: DecisionSkeletonInput['dimensions'][number]) =>
    patch((s) => {
      const prev = s.dimensions[index]?.name
      return {
        ...s,
        dimensions: s.dimensions.map((d, i) => (i === index ? dimension : d)),
        scores: (s.scores ?? []).map((cell) =>
          cell.dimension === prev ? { ...cell, dimension: dimension.name } : cell,
        ),
      }
    })
  const setOption = (index: number, option: DecisionSkeletonInput['options'][number]) =>
    patch((s) => {
      const prev = s.options[index]?.name
      return {
        ...s,
        options: s.options.map((o, i) => (i === index ? option : o)),
        scores: (s.scores ?? []).map((cell) =>
          cell.option === prev ? { ...cell, option: option.name } : cell,
        ),
      }
    })
  const setScore = (index: number, cell: SkeletonScoreInput) =>
    patch((s) => ({
      ...s,
      scores: (s.scores ?? []).map((c, i) => (i === index ? cell : c)),
    }))

  const invalid =
    skeleton.name.trim() === '' ||
    skeleton.dimensions.some((d) => d.name.trim() === '') ||
    skeleton.options.some((o) => o.name.trim() === '') ||
    scores.some((c) => {
      if (c.option.trim() === '' || c.dimension.trim() === '') return true
      const dim = dimOf(skeleton, c.dimension)
      if (dim && dimensionScale(dim) === 'nominal') return !c.labels || c.labels.length === 0
      return false
    })

  return (
    <div className="rounded-xl border border-hairline bg-surface p-3">
      <p className="font-mono text-[10.5px] uppercase tracking-[0.1em] text-ink-4">
        Proposed decision — edit before filling in
      </p>

      <div className="mt-2">
        <input
          className={inputClass}
          placeholder="Decision name"
          value={skeleton.name}
          onChange={(e) => patch((s) => ({ ...s, name: e.target.value }))}
        />
      </div>

      {skeleton.dimensions.length > 0 && (
        <p className="mt-3 text-xs font-semibold text-ink-3">Dimensions</p>
      )}
      <div className="mt-1 space-y-3">
        {skeleton.dimensions.map((d, i) => (
          <div key={i} className="rounded-lg border border-hairline bg-surface-2 p-2.5">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-semibold text-ink-3">Dimension {i + 1}</span>
              <button
                type="button"
                aria-label="Remove dimension"
                className="h-11 w-11 rounded-md text-lg text-ink-4 hover:bg-hover"
                onClick={() =>
                  patch((s) => ({
                    ...s,
                    dimensions: s.dimensions.filter((_, j) => j !== i),
                    scores: (s.scores ?? []).filter((c) => c.dimension !== d.name),
                  }))
                }
              >
                ×
              </button>
            </div>
            <DimensionFields dimension={d} onChange={(dimension) => setDimension(i, dimension)} />
          </div>
        ))}
      </div>

      {skeleton.options.length > 0 && (
        <p className="mt-3 text-xs font-semibold text-ink-3">Options</p>
      )}
      <div className="mt-1 space-y-3">
        {skeleton.options.map((o, i) => (
          <div key={i} className="rounded-lg border border-hairline bg-surface-2 p-2.5">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-semibold text-ink-3">Option {i + 1}</span>
              <button
                type="button"
                aria-label="Remove option"
                className="h-11 w-11 rounded-md text-lg text-ink-4 hover:bg-hover"
                onClick={() =>
                  patch((s) => ({
                    ...s,
                    options: s.options.filter((_, j) => j !== i),
                    scores: (s.scores ?? []).filter((c) => c.option !== o.name),
                  }))
                }
              >
                ×
              </button>
            </div>
            <div className="space-y-2">
              <input
                className={inputClass}
                placeholder="Option name"
                value={o.name}
                onChange={(e) => setOption(i, { ...o, name: e.target.value })}
              />
              <input
                className={inputClass}
                placeholder="Notes (optional)"
                value={o.notes ?? ''}
                onChange={(e) =>
                  setOption(i, { ...o, notes: e.target.value.trim() || undefined })
                }
              />
            </div>
          </div>
        ))}
      </div>

      {scores.length > 0 && <p className="mt-3 text-xs font-semibold text-ink-3">Scores</p>}
      <div className="mt-1 space-y-3">
        {scores.map((cell, i) => {
          const dim = dimOf(skeleton, cell.dimension)
          const scale = dim ? dimensionScale(dim) : undefined
          return (
            <div key={i} className="rounded-lg border border-hairline bg-surface-2 p-2.5">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-semibold text-ink-3">Score {i + 1}</span>
                <button
                  type="button"
                  aria-label="Remove score"
                  className="h-11 w-11 rounded-md text-lg text-ink-4 hover:bg-hover"
                  onClick={() =>
                    patch((s) => ({
                      ...s,
                      scores: (s.scores ?? []).filter((_, j) => j !== i),
                    }))
                  }
                >
                  ×
                </button>
              </div>
              <div className="space-y-2">
                <select
                  className={smallSelect}
                  value={cell.option}
                  onChange={(e) => setScore(i, { ...cell, option: e.target.value })}
                >
                  {skeleton.options.map((o) => (
                    <option key={o.name} value={o.name}>
                      {o.name || 'Option'}
                    </option>
                  ))}
                </select>
                <select
                  className={smallSelect}
                  value={cell.dimension}
                  onChange={(e) => {
                    const next = dimOf(skeleton, e.target.value)
                    const nextScale = next ? dimensionScale(next) : undefined
                    setScore(i, {
                      option: cell.option,
                      dimension: e.target.value,
                      ...(nextScale === 'nominal'
                        ? { labels: [] }
                        : { value: nextScale === 'rating' ? 3 : 0 }),
                    })
                  }}
                >
                  {skeleton.dimensions.map((d) => (
                    <option key={d.name} value={d.name}>
                      {d.name || 'Dimension'}
                    </option>
                  ))}
                </select>
                {scale === 'rating' ? (
                  <ImportancePicker
                    value={
                      Number.isInteger(cell.value) && (cell.value ?? 0) >= 1 && (cell.value ?? 0) <= 5
                        ? cell.value!
                        : 3
                    }
                    onChange={(value) => setScore(i, { option: cell.option, dimension: cell.dimension, value })}
                  />
                ) : scale === 'nominal' ? (
                  <LabelPicker
                    value={cell.labels ?? []}
                    suggestions={dim ? unitPresets(dim) : []}
                    placeholder={`Add ${dim?.unit || dim?.name.toLowerCase() || 'value'}`}
                    onChange={(labels) =>
                      setScore(i, { option: cell.option, dimension: cell.dimension, labels })
                    }
                  />
                ) : (
                  <input
                    className={inputClass}
                    type="number"
                    step="any"
                    value={cell.value ?? ''}
                    onChange={(e) =>
                      setScore(i, {
                        option: cell.option,
                        dimension: cell.dimension,
                        value: Number(e.target.value),
                      })
                    }
                  />
                )}
              </div>
            </div>
          )
        })}
      </div>

      <div className="mt-2 flex flex-wrap gap-1">
        <button
          type="button"
          className="min-h-11 rounded-md border border-dashed border-hairline px-2.5 text-xs text-ink-3 hover:bg-hover"
          onClick={() =>
            patch((s) => ({
              ...s,
              dimensions: [...s.dimensions, { name: '', kind: 'subjective', importance: 3 }],
            }))
          }
        >
          + dimension
        </button>
        <button
          type="button"
          className="min-h-11 rounded-md border border-dashed border-hairline px-2.5 text-xs text-ink-3 hover:bg-hover"
          onClick={() => patch((s) => ({ ...s, options: [...s.options, { name: '' }] }))}
        >
          + option
        </button>
        {skeleton.dimensions.length > 0 && skeleton.options.length > 0 && (
          <button
            type="button"
            className="min-h-11 rounded-md border border-dashed border-hairline px-2.5 text-xs text-ink-3 hover:bg-hover"
            onClick={() =>
              patch((s) => ({
                ...s,
                scores: [
                  ...(s.scores ?? []),
                  {
                    option: s.options[0].name,
                    dimension: s.dimensions[0].name,
                    ...(dimensionScale(s.dimensions[0]) === 'nominal'
                      ? { labels: [] }
                      : { value: s.dimensions[0].kind === 'subjective' ? 3 : 0 }),
                  },
                ],
              }))
            }
          >
            + score
          </button>
        )}
      </div>

      {outcome && (
        <p className="mt-2 rounded-md border border-red-400/30 bg-red-400/10 px-2 py-1.5 text-xs text-red-300">
          Couldn't create the decision: {outcome.error}
        </p>
      )}

      <div className="mt-3 space-y-2">
        <button
          type="button"
          disabled={invalid}
          className="w-full rounded-xl bg-accent py-3 text-sm font-semibold text-on-accent disabled:opacity-40"
          onClick={() => onApply(skeleton)}
        >
          Fill in what you can
        </button>
        <button
          type="button"
          className="w-full rounded-xl py-3 text-sm font-medium text-ink-3 hover:bg-hover"
          onClick={onKeepChatting}
        >
          Keep chatting
        </button>
      </div>
    </div>
  )
}
