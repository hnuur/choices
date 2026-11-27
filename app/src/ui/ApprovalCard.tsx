// Approval card per PLAN.md Phase-6: rows are editable before approve —
// edit fields, remove rows, add rows. Approve applies exactly what is on
// the card at that moment; reject applies nothing.

import { useImperativeHandle, useState, type Ref } from 'react'
import type { ApplyOutcome } from '../ai/apply'
import type { Proposal } from '../ai/proposals'
import { coerceSetScore, sanitizeProposals } from '../ai/sanitizeProposals'
import type { DecisionBundle } from '../queries'
import type { DimensionInput } from '../types'
import { dimensionScale, unitPresets } from '../units'
import { Field, ImportancePicker, LabelPicker, inputClass } from './bits'

const TYPE_LABEL: Record<Proposal['type'], string> = {
  renameDecision: 'Rename decision',
  addDimension: 'Add dimension',
  updateDimension: 'Update dimension',
  deleteDimension: 'Delete dimension',
  addOption: 'Add option',
  updateOption: 'Update option',
  deleteOption: 'Delete option',
  setScore: 'Set score',
  // Ramble scope only — decision-bound cards never render this row.
  createDecision: 'Create decision',
}

function rowInvalid(p: Proposal, bundle: DecisionBundle): boolean {
  switch (p.type) {
    case 'renameDecision':
      return p.name.trim() === ''
    case 'addDimension':
      return p.dimension.name.trim() === ''
    case 'addOption':
      return p.option.name.trim() === ''
    case 'updateOption':
      return !bundle.options.some((option) => option.id === p.id) || p.patch.name?.trim() === ''
    case 'deleteOption':
      return !bundle.options.some((option) => option.id === p.id)
    case 'updateDimension':
      return !bundle.dimensions.some((dimension) => dimension.id === p.id) || p.patch.name?.trim() === ''
    case 'deleteDimension':
      return !bundle.dimensions.some((dimension) => dimension.id === p.id)
    case 'createDecision':
      return true
    case 'setScore': {
      if (!bundle.options.some((o) => o.id === p.optionId)) return true
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

export function reviewableProposals(proposals: Proposal[], bundle: DecisionBundle) {
  return proposals.filter((proposal) => !rowInvalid(proposal, bundle))
}

function rowInvalidReason(p: Proposal, bundle: DecisionBundle): string | null {
  if (!rowInvalid(p, bundle)) return null
  if (p.type !== 'setScore') return 'This row needs a fix before Approve.'
  if (!bundle.options.some((o) => o.id === p.optionId)) return 'Pick an option from the list.'
  const dim = bundle.dimensions.find((d) => d.id === p.dimensionId)
  if (!dim) return 'Pick a dimension from the list.'
  const scale = dimensionScale(dim)
  if (scale === 'nominal') return `Add at least one ${dim.unit || dim.name.toLowerCase()} label.`
  if (scale === 'rating') return 'Pick a rating from 1 to 5.'
  return 'Enter a number.'
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
      <Field label="Option">
        <select
          className={inputClass}
          value={bundle.options.some((o) => o.id === p.optionId) ? p.optionId : ''}
          onChange={(e) => {
            const optionId = e.target.value
            const dim = bundle.dimensions.find((d) => d.id === p.dimensionId)
            onChange(dim ? coerceSetScore({ ...p, optionId }, dim) : { ...p, optionId })
          }}
        >
          {!bundle.options.some((o) => o.id === p.optionId) && (
            <option value="" disabled>
              Pick an option
            </option>
          )}
          {bundle.options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Dimension">
        <select
          className={inputClass}
          value={bundle.dimensions.some((d) => d.id === p.dimensionId) ? p.dimensionId : ''}
          onChange={(e) => {
            const dimensionId = e.target.value
            const next = bundle.dimensions.find((d) => d.id === dimensionId)
            if (next) onChange(coerceSetScore({ ...p, dimensionId }, next))
            else onChange({ ...p, dimensionId, value: undefined, labels: undefined })
          }}
        >
          {!bundle.dimensions.some((d) => d.id === p.dimensionId) && (
            <option value="" disabled>
              Pick a dimension
            </option>
          )}
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
      </Field>
      {scale === 'rating' ? (
        <ImportancePicker
          label="Rating from 1 to 5"
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
            inputMode="decimal"
            aria-label={dim?.unit ? `Score in ${dim.unit}` : 'Score'}
            value={p.value ?? ''}
            onChange={(e) => onChange({ ...p, value: e.target.value === '' ? undefined : Number(e.target.value), labels: undefined })}
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
      <Field label="Dimension name">
        <input
          className={inputClass}
          placeholder="Dimension name"
          value={dimension.name}
          onChange={(e) => onChange({ ...dimension, name: e.target.value })}
        />
      </Field>
      <div className="segmented" role="group" aria-label="Dimension type">
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
            aria-pressed={dimension.kind === kind}
          >
            {kind === 'objective' ? 'Objective' : 'Subjective'}
          </button>
        ))}
      </div>
      {dimension.kind === 'objective' && (
        <>
          {dimensionScale(dimension) === 'numeric' && (
            <div className="segmented" role="group" aria-label="Preferred direction">
              {(['higher', 'lower'] as const).map((direction) => (
                <button
                  key={direction}
                  type="button"
                  onClick={() => onChange({ ...dimension, direction })}
                  aria-pressed={dimension.direction === direction}
                >
                  {direction === 'higher' ? 'Higher' : 'Lower'} is better
                </button>
              ))}
            </div>
          )}
          <Field label="Unit (optional)">
            <input
              className={inputClass}
              placeholder="For example, hours"
              value={dimension.unit ?? ''}
              onChange={(e) => onChange({ ...dimension, unit: e.target.value.trim() || undefined })}
            />
          </Field>
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
  applying = false,
  reviewRef,
}: {
  bundle: DecisionBundle
  initial: Proposal[]
  onApply: (proposals: Proposal[]) => void
  onReject: () => void
  /** Present once applied; the card then renders its result rows. */
  outcomes?: ApplyOutcome[]
  applying?: boolean
  reviewRef?: Ref<() => Proposal[]>
}) {
  const [{ proposals, dropped }, setReview] = useState(() => sanitizeProposals(initial, bundle))
  const setProposals = (update: (rows: Proposal[]) => Proposal[]) =>
    setReview((review) => ({ ...review, proposals: update(review.proposals) }))
  const valid = reviewableProposals(proposals, bundle)
  useImperativeHandle(reviewRef, () => () => outcomes || applying ? [] : valid)

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
      <div className="surface-card">
        <p className="text-base font-semibold text-ink">
          {outcomes.length === 0
            ? 'Rejected — nothing changed'
            : applied === outcomes.length
              ? `${applied} ${applied === 1 ? 'change' : 'changes'} applied`
              : `${applied} applied, ${outcomes.length - applied} failed`}
        </p>
        {outcomes.length > 0 && (
          <ul className="mt-2 space-y-1">
            {outcomes.map((o) => (
              <li key={o.index} className="text-sm leading-relaxed text-ink-2">
                <span className={o.ok ? 'text-accent-ink' : 'text-danger'}>{o.ok ? '✓' : '✗'}</span>{' '}
                {o.label}
                {!o.ok && o.error && <span className="text-danger"> — {o.error}</span>}
              </li>
            ))}
          </ul>
        )}
      </div>
    )
  }

  const invalidCount = proposals.length - valid.length
  const invalid = invalidCount > 0
  const setScoreCount = proposals.filter((p) => p.type === 'setScore').length
  const compactScores = setScoreCount >= 6 && setScoreCount === proposals.length

  return (
    <div className="approval-card flex flex-col overflow-hidden rounded-xl border border-divider bg-surface">
      <div className="shrink-0 px-3 pt-3">
        <p className="section-title">
          Proposed changes — edit before approving
        </p>
        {dropped > 0 && (
          <p className="mt-2 text-sm text-warning">
            Dropped {dropped} unusable score {dropped === 1 ? 'row' : 'rows'} (unknown id or empty
            cell). The rest can be approved.
          </p>
        )}
        {invalid && (
          <p className="mt-2 text-sm text-warning">
            {invalidCount} {invalidCount === 1 ? 'row needs' : 'rows need'} a fix — remove{' '}
            {invalidCount === 1 ? 'it' : 'them'}, or Approve the valid rows only.
          </p>
        )}
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-2">
        {proposals.map((p, i) => {
          const bad = rowInvalid(p, bundle)
          const reason = rowInvalidReason(p, bundle)
          if (compactScores && p.type === 'setScore') {
            const opt = bundle.options.find((o) => o.id === p.optionId)
            const dim = bundle.dimensions.find((d) => d.id === p.dimensionId)
            const scale = dim ? dimensionScale(dim) : undefined
            const summary =
              scale === 'nominal'
                ? (p.labels ?? []).join(', ') || '—'
                : p.value === undefined
                  ? '—'
                  : String(p.value)
            return (
              <div
                key={i}
                className={`flex flex-wrap items-start gap-2 rounded-lg border bg-surface-2 p-2 ${
                  bad ? 'border-warning/65' : 'border-hairline'
                }`}
              >
                <div className="min-w-0 flex-1 basis-[calc(100%-4rem)] py-1.5">
                  <p className="text-sm font-medium text-ink">{opt?.name ?? 'Option'}</p>
                  <p className="text-sm text-ink-3">
                    {dim?.name ?? 'Dimension'}
                    {dim?.unit ? ` · ${dim.unit}` : ''} · {summary}
                  </p>
                  {reason && <p className="mt-1 text-sm text-warning">{reason}</p>}
                </div>
                {scale === 'rating' && (
                  <div className="segmented order-last w-full" role="group" aria-label="Rating from 1 to 5">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <button
                        key={n}
                        type="button"
                        aria-pressed={p.value === n}
                        onClick={() => update(i, { ...p, value: n, labels: undefined })}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                )}
                {scale === 'numeric' && (
                  <input
                    className={`${inputClass} order-last`}
                    aria-label={`${opt?.name ?? 'Option'} · ${dim?.name ?? 'Score'}`}
                    inputMode="decimal"
                    type="number"
                    step="any"
                    value={p.value ?? ''}
                    onChange={(e) =>
                      update(i, { ...p, value: e.target.value === '' ? undefined : Number(e.target.value), labels: undefined })
                    }
                  />
                )}
                <button
                  type="button"
                  aria-label="Remove row"
                  className="icon-action shrink-0 text-lg text-danger"
                  onClick={() => remove(i)}
                >
                  ×
                </button>
              </div>
            )
          }
          return (
          <div
            key={i}
            className={`rounded-lg border bg-surface-2 p-2.5 ${
              bad ? 'border-warning/65' : 'border-hairline'
            }`}
          >
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-semibold text-ink">{TYPE_LABEL[p.type]}</span>
              <button
                type="button"
                aria-label="Remove row"
                className="icon-action shrink-0 text-lg text-danger"
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
            {p.type === 'renameDecision' && (
              <Field label="New decision name">
                <input
                  className={inputClass}
                  value={p.name}
                  onChange={(event) => update(i, { ...p, name: event.target.value })}
                />
              </Field>
            )}
            {p.type === 'updateDimension' && (
              <div className="space-y-2">
                <p className="text-xs text-ink-3">“{nameOf.dimension(p.id)}”</p>
                {p.patch.name !== undefined && (
                  <Field label="New dimension name">
                  <input
                    className={inputClass}
                    value={p.patch.name}
                    onChange={(e) => update(i, { ...p, patch: { ...p.patch, name: e.target.value } })}
                  />
                  </Field>
                )}
                {p.patch.kind !== undefined && (
                  <>
                    <div className="segmented" role="group" aria-label="Dimension type">
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
                          aria-pressed={p.patch.kind === kind}
                        >
                          {kind === 'objective' ? 'Objective' : 'Subjective'}
                        </button>
                      ))}
                    </div>
                    {bundle.dimensions.find((d) => d.id === p.id)?.kind !== p.patch.kind && (
                      <p className="text-sm text-warning">
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
                  <div className="segmented" role="group" aria-label="Preferred direction">
                    {(['higher', 'lower'] as const).map((direction) => (
                      <button
                        key={direction}
                        type="button"
                        onClick={() => update(i, { ...p, patch: { ...p.patch, direction } })}
                        aria-pressed={p.patch.direction === direction}
                      >
                        {direction === 'higher' ? 'Higher' : 'Lower'} is better
                      </button>
                    ))}
                  </div>
                )}
                {p.patch.unit !== undefined && (
                  <Field label="Unit (empty clears)">
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
                  </Field>
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
                <Field label="Option name">
                  <input
                    className={inputClass}
                    placeholder="Option name"
                    value={p.option.name}
                    onChange={(e) => update(i, { ...p, option: { ...p.option, name: e.target.value } })}
                  />
                </Field>
                <Field label="Notes (optional)">
                  <input
                    className={inputClass}
                    placeholder="Notes (optional)"
                    value={p.option.notes ?? ''}
                    onChange={(e) =>
                      update(i, { ...p, option: { ...p.option, notes: e.target.value.trim() || undefined } })
                    }
                  />
                </Field>
              </div>
            )}
            {p.type === 'updateOption' && (
              <div className="space-y-2">
                <p className="text-sm text-ink-2">“{nameOf.option(p.id)}”</p>
                {p.patch.name !== undefined && (
                  <Field label="New option name">
                    <input
                      className={inputClass}
                      value={p.patch.name}
                      onChange={(event) => update(i, { ...p, patch: { ...p.patch, name: event.target.value } })}
                    />
                  </Field>
                )}
                {'notes' in p.patch && (
                  <Field label="Option notes">
                    <textarea
                      className={inputClass}
                      value={p.patch.notes ?? ''}
                      onChange={(event) => update(i, { ...p, patch: { ...p.patch, notes: event.target.value || null } })}
                    />
                  </Field>
                )}
              </div>
            )}
            {p.type === 'deleteOption' && (
              <p className="text-sm text-ink-2">“{nameOf.option(p.id)}” and its scores</p>
            )}
            {p.type === 'setScore' && (
              <SetScoreFields p={p} bundle={bundle} onChange={(next) => update(i, next)} />
            )}
            {reason && <p className="mt-2 text-sm text-warning">{reason}</p>}
          </div>
          )
        })}
      </div>

      <div className="shrink-0 space-y-2 border-t border-hairline bg-surface px-3 py-3">
        <div className="flex flex-wrap gap-1">
          <button
            type="button"
            className="text-action"
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
            className="text-action"
            onClick={() => add({ type: 'addOption', option: { name: '' } })}
          >
            + option
          </button>
          {bundle.dimensions.length > 0 && bundle.options.length > 0 && (
            <button
              type="button"
              className="text-action"
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
        <button
          type="button"
          disabled={applying || valid.length === 0}
          className="primary-action w-full"
          onClick={() => onApply(valid)}
        >
          {applying ? 'Saving…' : invalid
            ? `Approve valid (${proposals.length - invalidCount})`
            : `Approve${proposals.length > 0 ? ` (${proposals.length})` : ''}`}
        </button>
        <button
          type="button"
          className="text-action w-full"
          onClick={onReject}
          disabled={applying}
        >
          Reject
        </button>
      </div>
    </div>
  )
}
