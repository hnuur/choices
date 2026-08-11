// Ramble approval card per PLAN.md Phase-7: the whole proposed decision
// skeleton as editable rows — same mechanics as the Phase-6 card. Approve
// applies exactly what is on the card at that moment; reject creates nothing.

import { useState } from 'react'
import type { DecisionSkeletonInput } from '../types'
import { DimensionFields } from './ApprovalCard'
import { inputClass } from './bits'

export type SkeletonOutcome = 'rejected' | { error: string }

export default function SkeletonCard({
  initial,
  onApply,
  onReject,
  outcome,
}: {
  initial: DecisionSkeletonInput
  onApply: (skeleton: DecisionSkeletonInput) => void
  onReject: () => void
  /** Present after reject, or a failed apply (the card stays editable then). */
  outcome?: SkeletonOutcome
}) {
  const [skeleton, setSkeleton] = useState<DecisionSkeletonInput>(initial)

  if (outcome === 'rejected') {
    return (
      <div className="rounded-xl border border-hairline bg-surface p-3">
        <p className="text-sm font-medium text-ink-2">Rejected — nothing created</p>
      </div>
    )
  }

  const setDimension = (index: number, dimension: DecisionSkeletonInput['dimensions'][number]) =>
    setSkeleton((s) => ({
      ...s,
      dimensions: s.dimensions.map((d, i) => (i === index ? dimension : d)),
    }))
  const setOption = (index: number, option: DecisionSkeletonInput['options'][number]) =>
    setSkeleton((s) => ({ ...s, options: s.options.map((o, i) => (i === index ? option : o)) }))

  const invalid =
    skeleton.name.trim() === '' ||
    skeleton.dimensions.some((d) => d.name.trim() === '') ||
    skeleton.options.some((o) => o.name.trim() === '')

  return (
    <div className="rounded-xl border border-hairline bg-surface p-3">
      <p className="font-mono text-[10.5px] uppercase tracking-[0.1em] text-ink-4">
        Proposed decision — edit before approving
      </p>

      <div className="mt-2">
        <input
          className={inputClass}
          placeholder="Decision name"
          value={skeleton.name}
          onChange={(e) => setSkeleton((s) => ({ ...s, name: e.target.value }))}
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
                  setSkeleton((s) => ({ ...s, dimensions: s.dimensions.filter((_, j) => j !== i) }))
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
                  setSkeleton((s) => ({ ...s, options: s.options.filter((_, j) => j !== i) }))
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

      <div className="mt-2 flex flex-wrap gap-1">
        <button
          type="button"
          className="min-h-11 rounded-md border border-dashed border-hairline px-2.5 text-xs text-ink-3 hover:bg-hover"
          onClick={() =>
            setSkeleton((s) => ({
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
          onClick={() => setSkeleton((s) => ({ ...s, options: [...s.options, { name: '' }] }))}
        >
          + option
        </button>
      </div>

      {outcome && typeof outcome === 'object' && (
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
          Approve — create this decision
        </button>
        <button
          type="button"
          className="w-full rounded-xl py-3 text-sm font-medium text-ink-3 hover:bg-hover"
          onClick={onReject}
        >
          Reject
        </button>
      </div>
    </div>
  )
}
