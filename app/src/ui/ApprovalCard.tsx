// Approval card per PLAN.md Phase-6: rows are editable before approve —
// edit fields, remove rows, add rows. Approve applies exactly what is on
// the card at that moment; reject applies nothing.

import { useState } from 'react'
import type { ApplyOutcome } from '../ai/apply'
import type { Proposal } from '../ai/proposals'
import type { DecisionBundle } from '../queries'
import type { DimensionInput } from '../types'
import { ImportancePicker, inputClass } from './bits'

const TYPE_LABEL: Record<Proposal['type'], string> = {
  addDimension: 'Add dimension',
  updateDimension: 'Update dimension',
  deleteDimension: 'Delete dimension',
  addOption: 'Add option',
  deleteOption: 'Delete option',
  setScore: 'Set score',
}

const smallSelect =
  'w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm focus:border-sky-500 focus:outline-none'

function rowInvalid(p: Proposal): boolean {
  switch (p.type) {
    case 'addDimension':
      return p.dimension.name.trim() === ''
    case 'addOption':
      return p.option.name.trim() === ''
    case 'setScore':
      return p.optionId === '' || p.dimensionId === ''
    default:
      return false
  }
}

function DimensionFields({
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
            className={`flex-1 rounded-md px-2 py-1.5 text-sm font-medium ${
              dimension.kind === kind ? 'bg-sky-500 text-white' : 'bg-white text-slate-600'
            }`}
          >
            {kind}
          </button>
        ))}
      </div>
      {dimension.kind === 'objective' && (
        <>
          <div className="flex gap-1">
            {(['higher', 'lower'] as const).map((direction) => (
              <button
                key={direction}
                type="button"
                onClick={() => onChange({ ...dimension, direction })}
                className={`flex-1 rounded-md px-2 py-1.5 text-sm ${
                  dimension.direction === direction ? 'bg-sky-500 text-white' : 'bg-white text-slate-600'
                }`}
              >
                {direction} is better
              </button>
            ))}
          </div>
          <input
            className={inputClass}
            placeholder="Unit (optional)"
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
      <div className="rounded-xl bg-white p-3 shadow-sm">
        <p className="text-sm font-medium text-slate-700">
          {applied === outcomes.length
            ? `${applied} ${applied === 1 ? 'change' : 'changes'} applied`
            : `${applied} applied, ${outcomes.length - applied} failed`}
        </p>
        <ul className="mt-2 space-y-1">
          {outcomes.map((o) => (
            <li key={o.index} className="text-xs text-slate-600">
              <span className={o.ok ? 'text-emerald-600' : 'text-red-600'}>{o.ok ? '✓' : '✗'}</span>{' '}
              {o.label}
              {!o.ok && o.error && <span className="text-red-600"> — {o.error}</span>}
            </li>
          ))}
        </ul>
      </div>
    )
  }

  const objectiveDims = bundle.dimensions.filter((d) => d.kind === 'objective')
  const invalid = proposals.some(rowInvalid)

  return (
    <div className="rounded-xl bg-white p-3 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
        Proposed changes — edit before approving
      </p>
      <div className="mt-2 space-y-3">
        {proposals.map((p, i) => (
          <div key={i} className="rounded-lg bg-slate-50 p-2.5">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500">{TYPE_LABEL[p.type]}</span>
              <button
                type="button"
                aria-label="Remove row"
                className="h-7 w-7 rounded-md text-slate-400 hover:bg-slate-200"
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
                <p className="text-xs text-slate-500">“{nameOf.dimension(p.id)}”</p>
                {p.patch.name !== undefined && (
                  <input
                    className={inputClass}
                    value={p.patch.name}
                    onChange={(e) => update(i, { ...p, patch: { ...p.patch, name: e.target.value } })}
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
              <p className="text-sm text-slate-700">“{nameOf.dimension(p.id)}” and its scores</p>
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
              <p className="text-sm text-slate-700">“{nameOf.option(p.id)}” and its scores</p>
            )}
            {p.type === 'setScore' && (
              <div className="space-y-2">
                <select
                  className={smallSelect}
                  value={p.optionId}
                  onChange={(e) => update(i, { ...p, optionId: e.target.value })}
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
                  onChange={(e) => update(i, { ...p, dimensionId: e.target.value })}
                >
                  {objectiveDims.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                      {d.unit ? ` (${d.unit})` : ''}
                    </option>
                  ))}
                </select>
                <input
                  className={inputClass}
                  type="number"
                  step="any"
                  value={p.value}
                  onChange={(e) => update(i, { ...p, value: Number(e.target.value) })}
                />
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="mt-2 flex flex-wrap gap-1">
        <button
          type="button"
          className="rounded-md border border-dashed border-slate-300 px-2 py-1 text-xs text-slate-500 hover:bg-slate-100"
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
          className="rounded-md border border-dashed border-slate-300 px-2 py-1 text-xs text-slate-500 hover:bg-slate-100"
          onClick={() => add({ type: 'addOption', option: { name: '' } })}
        >
          + option
        </button>
        {objectiveDims.length > 0 && bundle.options.length > 0 && (
          <button
            type="button"
            className="rounded-md border border-dashed border-slate-300 px-2 py-1 text-xs text-slate-500 hover:bg-slate-100"
            onClick={() =>
              add({
                type: 'setScore',
                optionId: bundle.options[0].id,
                dimensionId: objectiveDims[0].id,
                value: 0,
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
          className="w-full rounded-md bg-sky-500 py-2.5 text-sm font-semibold text-white enabled:hover:bg-sky-600 disabled:opacity-40"
          onClick={() => onApply(proposals)}
        >
          Approve{proposals.length > 0 ? ` (${proposals.length})` : ''}
        </button>
        <button
          type="button"
          className="w-full rounded-md py-2.5 text-sm font-medium text-slate-500 hover:bg-slate-100"
          onClick={onReject}
        >
          Reject
        </button>
      </div>
    </div>
  )
}
