// Approval card per PLAN.md Phase-6: rows are editable before approve —
// edit fields, remove rows, add rows. Approve applies exactly what is on
// the card at that moment; reject applies nothing.

import { useState } from 'react'
import type { ApplyOutcome } from '../ai/apply'
import type { Proposal } from '../ai/proposals'
import type { DecisionBundle } from '../queries'
import type { DimensionInput } from '../types'
import { dimensionScale, unitPresets } from '../units'
import { ImportancePicker, LabelPicker, inputClass } from './bits'

const TYPE_LABEL: Record<Proposal['type'], string> = {
  addDimension: 'Add dimension',
  updateDimension: 'Update dimension',
  deleteDimension: 'Delete dimension',
  addOption: 'Add option',
  deleteOption: 'Delete option',
  setScore: 'Set score',
  // Ramble scope only — decision-bound cards never render this row.
  createDecision: 'Create decision',
}

const smallSelect =
  'w-full rounded-lg border border-hairline bg-surface-2 px-2 py-2.5 text-sm text-ink focus:border-accent focus:outline-none'

function rowInvalid(p: Proposal, bundle: DecisionBundle): boolean {
  switch (p.type) {
    case 'addDimension':
      return p.dimension.name.trim() === ''
    case 'addOption':
      return p.option.name.trim() === ''
    case 'setScore': {
      if (p.optionId === '' || p.dimensionId === '') return true
      const dim = bundle.dimensions.find((d) => d.id === p.dimensionId)
      if (!dim) return true
      const scale = dimensionScale(dim)
      if (scale === 'nominal') return !p.labels || p.labels.length === 0
      if (p.value === undefined) return true
      if (scale === 'rating') return !Number.isInteger(p.value) || p.value < 1 || p.value > 5
      return !Number.isFinite(p.value)
    }
    default:
      return false
  }
}

function scorePayloadFor(
  dim: { kind: 'objective' | 'subjective'; name?: string; unit?: string } | undefined,
): Pick<Extract<Proposal, { type: 'setScore' }>, 'value' | 'labels'> {
  if (!dim) return { value: 0 }
  const scale = dimensionScale(dim)
  if (scale === 'nominal') return { labels: [] }
  if (scale === 'rating') return { value: 3 }
  return { value: 0 }
}

function SetScoreFields({
  p,
  bundle,
  onChange,
}: {
  p: Extract<Proposal, { type: 'setScore' }>
  bundle: DecisionBundle
  onChange: (next: Extract<Proposal, { type: 'setScore' }>) => void
}) {
  const dim = bundle.dimensions.find((d) => d.id === p.dimensionId)
  const scale = dim ? dimensionScale(dim) : undefined
  const suggestions = dim
    ? [
        ...unitPresets(dim),
        ...bundle.scores.flatMap((s) => (s.dimensionId === dim.id ? (s.labels ?? []) : [])),
      ].filter((label, i, all) => all.findIndex((x) => x.toLowerCase() === label.toLowerCase()) === i)
    : []
  return (
    <div className="space-y-2">
      <select
        className={smallSelect}
        value={p.optionId}
        onChange={(e) => onChange({ ...p, optionId: e.target.value })}
      >
        {bundle.options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
      <select
        className={smallSelect}
        value={p.dimensionId}
        onChange={(e) => {
          const dimensionId = e.target.value
          const next = bundle.dimensions.find((d) => d.id === dimensionId)
          onChange({ ...p, dimensionId, value: undefined, labels: undefined, ...scorePayloadFor(next) })
        }}
      >
        {bundle.dimensions.map((d) => (
          <option key={d.id} value={d.id}>
            {d.name}
            {dimensionScale(d) === 'rating'
              ? ' (1–5)'
              : dimensionScale(d) === 'nominal'
                ? ` (${d.unit || 'labels'})`
                : d.unit
                  ? ` (${d.unit})`
                  : ''}
          </option>
        ))}
      </select>
      {scale === 'rating' ? (
        <ImportancePicker
          value={p.value && Number.isInteger(p.value) && p.value >= 1 && p.value <= 5 ? p.value : 3}
          onChange={(value) => onChange({ ...p, value, labels: undefined })}
        />
      ) : scale === 'nominal' ? (
        <LabelPicker
          value={p.labels ?? []}
          suggestions={suggestions}
          placeholder={`Add ${dim?.unit || dim?.name.toLowerCase() || 'value'}`}
          onChange={(labels) => onChange({ ...p, labels, value: undefined })}
        />
      ) : (
        <div className="flex items-center gap-2">
          <input
            className={inputClass}
            type="number"
            step="any"
            value={p.value ?? ''}
            onChange={(e) => onChange({ ...p, value: Number(e.target.value), labels: undefined })}
          />
          {dim?.unit && <span className="shrink-0 text-sm text-ink-3">{dim.unit}</span>}
        </div>
      )}
    </div>
  )
}

export function DimensionFields({
  dimension,
  onChange,
}: {
  dimension: DimensionInput
  onChange: (d: DimensionInput) => void
}) {
  return (
    <div className="space-y-2">
      <input
        className={inputClass}
        placeholder="Dimension name"
        value={dimension.name}
        onChange={(e) => onChange({ ...dimension, name: e.target.value })}
      />
      <div className="flex gap-1">
        {(['objective', 'subjective'] as const).map((kind) => (
          <button
            key={kind}
            type="button"
            onClick={() =>
              onChange(
                kind === 'objective'
                  ? { ...dimension, kind, direction: dimension.direction ?? 'higher' }
                  : { ...dimension, kind, direction: undefined, unit: undefined },
              )
            }
            className={`flex-1 rounded-md px-2 py-2.5 text-sm font-medium ${
              dimension.kind === kind
                ? 'bg-accent font-semibold text-on-accent'
                : 'bg-hover text-ink-2 hover:bg-white/9'
            }`}
          >
            {kind}
          </button>
        ))}
      </div>
      {dimension.kind === 'objective' && (
        <>
          {dimensionScale(dimension) === 'numeric' && (
            <div className="flex gap-1">
              {(['higher', 'lower'] as const).map((direction) => (
                <button
                  key={direction}
                  type="button"
                  onClick={() => onChange({ ...dimension, direction })}
                  className={`flex-1 rounded-md px-2 py-2.5 text-sm ${
                    dimension.direction === direction
                      ? 'bg-accent font-semibold text-on-accent'
                      : 'bg-hover text-ink-2 hover:bg-white/9'
                  }`}
                >
                  {direction} is better
                </button>
              ))}
            </div>
          )}
          <input
            className={inputClass}
            placeholder="Unit (optional) — e.g. g, €, genre"
            value={dimension.unit ?? ''}
            onChange={(e) => onChange({ ...dimension, unit: e.target.value.trim() || undefined })}
          />
        </>
      )}
      <ImportancePicker
        value={dimension.importance}
        onChange={(importance) => onChange({ ...dimension, importance })}
      />
    </div>
  )
}

export default function ApprovalCard({
  bundle,
  initial,
  onApply,
  onReject,
  outcomes,
}: {
  bundle: DecisionBundle
  initial: Proposal[]
  onApply: (proposals: Proposal[]) => void
  onReject: () => void
  /** Present once applied; the card then renders its result rows. */
  outcomes?: ApplyOutcome[]
}) {
  const [proposals, setProposals] = useState<Proposal[]>(initial)

  const update = (index: number, p: Proposal) =>
    setProposals((rows) => rows.map((r, i) => (i === index ? p : r)))
  const remove = (index: number) => setProposals((rows) => rows.filter((_, i) => i !== index))
  const add = (p: Proposal) => setProposals((rows) => [...rows, p])

  const nameOf = {
    option: (id: string) => bundle.options.find((o) => o.id === id)?.name ?? id.slice(0, 8),
    dimension: (id: string) => bundle.dimensions.find((d) => d.id === id)?.name ?? id.slice(0, 8),
  }

  if (outcomes) {
    const applied = outcomes.filter((o) => o.ok).length
    return (
      <div className="rounded-xl border border-hairline bg-surface p-3">
        <p className="text-sm font-medium text-ink-2">
          {outcomes.length === 0
            ? 'Rejected — nothing changed'
            : applied === outcomes.length
              ? `${applied} ${applied === 1 ? 'change' : 'changes'} applied`
              : `${applied} applied, ${outcomes.length - applied} failed`}
        </p>
        {outcomes.length > 0 && (
          <ul className="mt-2 space-y-1">
            {outcomes.map((o) => (
              <li key={o.index} className="text-xs text-ink-2">
                <span className={o.ok ? 'text-accent-ink' : 'text-red-400'}>{o.ok ? '✓' : '✗'}</span>{' '}
                {o.label}
                {!o.ok && o.error && <span className="text-red-400"> — {o.error}</span>}
              </li>
            ))}
          </ul>
        )}
      </div>
    )
  }

  const invalid = proposals.some((p) => rowInvalid(p, bundle))

  return (
    <div className="rounded-xl border border-hairline bg-surface p-3">
      <p className="font-mono text-[10.5px] uppercase tracking-[0.1em] text-ink-4">
        Proposed changes — edit before approving
      </p>
      <div className="mt-2 space-y-3">
        {proposals.map((p, i) => (
          <div key={i} className="rounded-lg border border-hairline bg-surface-2 p-2.5">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-semibold text-ink-3">{TYPE_LABEL[p.type]}</span>
              <button
                type="button"
                aria-label="Remove row"
                className="h-11 w-11 rounded-md text-lg text-ink-4 hover:bg-hover"
                onClick={() => remove(i)}
              >
                ×
              </button>
            </div>
            {p.type === 'addDimension' && (
              <DimensionFields
                dimension={p.dimension}
                onChange={(dimension) => update(i, { ...p, dimension })}
              />
            )}
            {p.type === 'updateDimension' && (
              <div className="space-y-2">
                <p className="text-xs text-ink-3">“{nameOf.dimension(p.id)}”</p>
                {p.patch.name !== undefined && (
                  <input
                    className={inputClass}
                    value={p.patch.name}
                    onChange={(e) => update(i, { ...p, patch: { ...p.patch, name: e.target.value } })}
                  />
                )}
                {p.patch.kind !== undefined && (
                  <>
                    <div className="flex gap-1">
                      {(['objective', 'subjective'] as const).map((kind) => (
                        <button
                          key={kind}
                          type="button"
                          onClick={() =>
                            update(i, {
                              ...p,
                              patch:
                                kind === 'subjective'
                                  ? { ...p.patch, kind, direction: null }
                                  : {
                                      ...p.patch,
                                      kind,
                                      direction:
                                        p.patch.direction === 'higher' || p.patch.direction === 'lower'
                                          ? p.patch.direction
                                          : 'higher',
                                    },
                            })
                          }
                          className={`flex-1 rounded-md px-2 py-2.5 text-sm font-medium ${
                            p.patch.kind === kind
                              ? 'bg-accent font-semibold text-on-accent'
                              : 'bg-hover text-ink-2 hover:bg-white/9'
                          }`}
                        >
                          {kind}
                        </button>
                      ))}
                    </div>
                    {bundle.dimensions.find((d) => d.id === p.id)?.kind !== p.patch.kind && (
                      <p className="text-xs text-amber-300">
                        Changing the kind clears this dimension's scores.
                      </p>
                    )}
                  </>
                )}
                {p.patch.direction !== undefined &&
                  p.patch.kind !== 'subjective' &&
                  dimensionScale({
                    kind: p.patch.kind ?? bundle.dimensions.find((d) => d.id === p.id)?.kind ?? 'objective',
                    name: p.patch.name ?? bundle.dimensions.find((d) => d.id === p.id)?.name,
                    unit:
                      p.patch.unit === null
                        ? undefined
                        : (p.patch.unit ?? bundle.dimensions.find((d) => d.id === p.id)?.unit),
                  }) === 'numeric' && (
                  <div className="flex gap-1">
                    {(['higher', 'lower'] as const).map((direction) => (
                      <button
                        type="button"
                        onClick={() => update(i, { ...p, patch: { ...p.patch, direction } })}
                        className={`flex-1 rounded-md px-2 py-2.5 text-sm ${
                          p.patch.direction === direction
                            ? 'bg-accent font-semibold text-on-accent'
                            : 'bg-hover text-ink-2 hover:bg-white/9'
                        }`}
                      >
                        {direction} is better
                      </button>
                    ))}
                  </div>
                )}
                {p.patch.unit !== undefined && (
                  <input
                    className={inputClass}
                    placeholder="Unit (empty clears)"
                    value={p.patch.unit ?? ''}
                    onChange={(e) =>
                      update(i, {
                        ...p,
                        patch: { ...p.patch, unit: e.target.value.trim() === '' ? null : e.target.value.trim() },
                      })
                    }
                  />
                )}
                {p.patch.importance !== undefined && (
                  <ImportancePicker
                    value={p.patch.importance}
                    onChange={(importance) => update(i, { ...p, patch: { ...p.patch, importance } })}
                  />
                )}
              </div>
            )}
            {p.type === 'deleteDimension' && (
              <p className="text-sm text-ink-2">“{nameOf.dimension(p.id)}” and its scores</p>
            )}
            {p.type === 'addOption' && (
              <div className="space-y-2">
                <input
                  className={inputClass}
                  placeholder="Option name"
                  value={p.option.name}
                  onChange={(e) => update(i, { ...p, option: { ...p.option, name: e.target.value } })}
                />
                <input
                  className={inputClass}
                  placeholder="Notes (optional)"
                  value={p.option.notes ?? ''}
                  onChange={(e) =>
                    update(i, { ...p, option: { ...p.option, notes: e.target.value.trim() || undefined } })
                  }
                />
              </div>
            )}
            {p.type === 'deleteOption' && (
              <p className="text-sm text-ink-2">“{nameOf.option(p.id)}” and its scores</p>
            )}
            {p.type === 'setScore' && (
              <SetScoreFields p={p} bundle={bundle} onChange={(next) => update(i, next)} />
            )}
          </div>
        ))}
      </div>

      <div className="mt-2 flex flex-wrap gap-1">
        <button
          type="button"
          className="min-h-11 rounded-md border border-dashed border-hairline px-2.5 text-xs text-ink-3 hover:bg-hover"
          onClick={() =>
            add({
              type: 'addDimension',
              dimension: { name: '', kind: 'subjective', importance: 3 },
            })
          }
        >
          + dimension
        </button>
        <button
          type="button"
          className="min-h-11 rounded-md border border-dashed border-hairline px-2.5 text-xs text-ink-3 hover:bg-hover"
          onClick={() => add({ type: 'addOption', option: { name: '' } })}
        >
          + option
        </button>
        {bundle.dimensions.length > 0 && bundle.options.length > 0 && (
          <button
            type="button"
            className="min-h-11 rounded-md border border-dashed border-hairline px-2.5 text-xs text-ink-3 hover:bg-hover"
            onClick={() =>
              add({
                type: 'setScore',
                optionId: bundle.options[0].id,
                dimensionId: bundle.dimensions[0].id,
                ...scorePayloadFor(bundle.dimensions[0]),
              })
            }
          >
            + score
          </button>
        )}
      </div>

      <div className="mt-3 space-y-2">
        <button
          type="button"
          disabled={proposals.length === 0 || invalid}
          className="w-full rounded-xl bg-accent py-3 text-sm font-semibold text-on-accent disabled:opacity-40"
          onClick={() => onApply(proposals)}
        >
          Approve{proposals.length > 0 ? ` (${proposals.length})` : ''}
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
