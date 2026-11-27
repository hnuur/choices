import { useState } from 'react'
import { ValidationError, addDimension, deleteDimension, updateDimension } from '../mutations'
import type { DecisionBundle } from '../queries'
import type { Dimension, DimensionInput } from '../types'
import { dimensionScale } from '../units'
import { Badge, ConfirmButton, Field, FieldError, ImportancePicker, inputClass } from './bits'

interface FormState {
  name: string
  kind: 'objective' | 'subjective'
  direction: 'higher' | 'lower'
  importance: number
  unit: string
}

const emptyForm: FormState = { name: '', kind: 'objective', direction: 'higher', importance: 3, unit: '' }
const formOf = (d: Dimension): FormState => ({
  name: d.name,
  kind: d.kind,
  direction: d.direction ?? 'higher',
  importance: d.importance,
  unit: d.unit ?? '',
})

function inputOf(form: FormState): DimensionInput {
  if (form.kind === 'subjective') {
    return { name: form.name, kind: 'subjective', importance: form.importance }
  }
  const unit = form.unit.trim() || undefined
  if (dimensionScale({ kind: 'objective', name: form.name, unit }) === 'nominal') {
    return { name: form.name, kind: 'objective', importance: form.importance, unit }
  }
  return {
    name: form.name,
    kind: 'objective',
    direction: form.direction,
    importance: form.importance,
    unit,
  }
}

function DimensionForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
  hint,
}: {
  initial: FormState
  submitLabel: string
  onSubmit: (input: DimensionInput) => Promise<void>
  onCancel?: () => void
  hint?: boolean
}) {
  const [form, setForm] = useState(initial)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const patch = (p: Partial<FormState>) => setForm((f) => ({ ...f, ...p }))

  const submit = async () => {
    if (saving) return
    setSaving(true)
    try {
      setError('')
      await onSubmit(inputOf(form))
    } catch (e) {
      setError(e instanceof ValidationError ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <form className="surface-card space-y-4" onSubmit={(event) => {
      event.preventDefault()
      void submit()
    }}>
      {hint && (
        <p className="text-sm leading-relaxed text-ink-2">
          Objective dimensions are facts with a unit (price, weight); a unit
          like genre is picked from a list, not typed as a number. Subjective
          ones are 1–5 ratings. Importance 1–5 is how much the ranking should
          care.
        </p>
      )}
      <Field label="Dimension name">
        <input
          className={inputClass}
          placeholder="For example, battery life"
          value={form.name}
          onChange={(e) => patch({ name: e.target.value })}
        />
      </Field>
      <div className="segmented" role="group" aria-label="Dimension type">
        {(['objective', 'subjective'] as const).map((kind) => (
          <button
            key={kind}
            type="button"
            onClick={() => patch({ kind })}
            aria-pressed={form.kind === kind}
          >
            {kind === 'objective' ? 'Objective' : 'Subjective'}
          </button>
        ))}
      </div>
      {form.kind === 'objective' && (
        <>
          {dimensionScale({ kind: 'objective', name: form.name, unit: form.unit }) === 'numeric' && (
            <div className="segmented" role="group" aria-label="Preferred direction">
              {(['higher', 'lower'] as const).map((direction) => (
                <button
                  key={direction}
                  type="button"
                  onClick={() => patch({ direction })}
                  aria-pressed={form.direction === direction}
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
              value={form.unit}
              onChange={(e) => patch({ unit: e.target.value })}
            />
          </Field>
          {dimensionScale({ kind: 'objective', name: form.name, unit: form.unit }) === 'nominal' && (
            <p className="text-xs text-ink-3">
              Score by typing or picking one or more values — not a 1–5 rating.
            </p>
          )}
        </>
      )}
      <div>
        <p className="field-label">Importance</p>
        <ImportancePicker value={form.importance} onChange={(importance) => patch({ importance })} />
      </div>
      {submitLabel === 'Save' && initial.kind !== form.kind && (
        <p className="text-sm text-warning">Changing the kind clears this dimension's scores.</p>
      )}
      {error && <FieldError message={error} />}
      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          className="primary-action"
          disabled={saving}
        >
          {saving ? 'Saving…' : submitLabel}
        </button>
        {onCancel && (
          <button
            type="button"
            className="text-action" disabled={saving}
            onClick={onCancel}
          >
            Cancel
          </button>
        )}
      </div>
    </form>
  )
}

export default function DimensionsTab({ bundle }: { bundle: DecisionBundle }) {
  const [adding, setAdding] = useState(bundle.dimensions.length === 0)
  const [editing, setEditing] = useState<string | null>(null)
  // Remounts the add form after each successful add so it starts clean.
  const [formKey, setFormKey] = useState(0)

  return (
    <div className="space-y-2">
      {bundle.dimensions.map((d) => (
        <div key={d.id} className="surface-card">
          {editing === d.id ? (
            <DimensionForm
              initial={formOf(d)}
              submitLabel="Save"
              onSubmit={async (input) => {
                await updateDimension(d.id, {
                  ...input,
                  direction: input.direction ?? null,
                  unit: input.unit ?? null,
                })
                setEditing(null)
              }}
              onCancel={() => setEditing(null)}
            />
          ) : (
            <div className="flex flex-wrap items-start gap-x-2 gap-y-1">
              <div className="min-w-0 flex-1 basis-36">
                <div className="text-lg leading-snug font-semibold">{d.name}</div>
                <div className="mt-1 flex flex-wrap gap-1">
                  <Badge>{d.kind}</Badge>
                  {dimensionScale(d) === 'numeric' && <Badge>{d.direction} is better</Badge>}
                  {dimensionScale(d) === 'nominal' && <Badge>pick labels</Badge>}
                  {d.unit && <Badge>{d.unit}</Badge>}
                  <Badge>importance {d.importance}</Badge>
                </div>
              </div>
              <button
                type="button"
                className="text-action"
                onClick={() => setEditing(d.id)}
              >
                Edit
              </button>
              <ConfirmButton onConfirm={() => void deleteDimension(d.id)} />
            </div>
          )}
        </div>
      ))}

      {adding ? (
        <DimensionForm
          key={formKey}
          initial={emptyForm}
          submitLabel="Add dimension"
          hint={bundle.dimensions.length === 0}
          onSubmit={async (input) => {
            await addDimension(bundle.decision.id, input)
            setFormKey((k) => k + 1)
          }}
          onCancel={bundle.dimensions.length > 0 ? () => setAdding(false) : undefined}
        />
      ) : (
        <button
          type="button"
          className="secondary-action"
          onClick={() => setAdding(true)}
        >
          + Add dimension
        </button>
      )}
    </div>
  )
}
