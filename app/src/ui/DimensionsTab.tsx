import { useState } from 'react'
import { ValidationError, addDimension, deleteDimension, updateDimension } from '../mutations'
import type { DecisionBundle } from '../queries'
import type { Dimension, DimensionInput } from '../types'
import { Badge, ConfirmButton, FieldError, ImportancePicker, inputClass } from './bits'

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
  return form.kind === 'objective'
    ? {
        name: form.name,
        kind: 'objective',
        direction: form.direction,
        importance: form.importance,
        unit: form.unit.trim() || undefined,
      }
    : { name: form.name, kind: 'subjective', importance: form.importance }
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
  const patch = (p: Partial<FormState>) => setForm((f) => ({ ...f, ...p }))

  const submit = async () => {
    try {
      setError('')
      await onSubmit(inputOf(form))
    } catch (e) {
      setError(e instanceof ValidationError ? e.message : String(e))
    }
  }

  return (
    <div className="space-y-3 rounded-xl border border-hairline bg-surface-2 p-3">
      {hint && (
        <p className="text-xs leading-relaxed text-ink-3">
          Objective dimensions are facts with a unit (price, weight); subjective ones are 1–5
          ratings. Importance 1–5 is how much the ranking should care.
        </p>
      )}
      <input
        className={inputClass}
        placeholder="Dimension name — e.g. weight, sexiness"
        value={form.name}
        onChange={(e) => patch({ name: e.target.value })}
      />
      <div className="flex gap-1">
        {(['objective', 'subjective'] as const).map((kind) => (
          <button
            key={kind}
            type="button"
            onClick={() => patch({ kind })}
            className={`flex-1 rounded-md px-2 py-2.5 text-sm font-medium ${
              form.kind === kind
                ? 'bg-accent font-semibold text-on-accent'
                : 'bg-hover text-ink-2 hover:bg-white/9'
            }`}
          >
            {kind}
          </button>
        ))}
      </div>
      {form.kind === 'objective' && (
        <>
          <div className="flex gap-1">
            {(['higher', 'lower'] as const).map((direction) => (
              <button
                key={direction}
                type="button"
                onClick={() => patch({ direction })}
                className={`flex-1 rounded-md px-2 py-2.5 text-sm ${
                  form.direction === direction
                    ? 'bg-accent font-semibold text-on-accent'
                    : 'bg-hover text-ink-2 hover:bg-white/9'
                }`}
              >
                {direction} is better
              </button>
            ))}
          </div>
          <input
            className={inputClass}
            placeholder="Unit (optional) — e.g. g, €"
            value={form.unit}
            onChange={(e) => patch({ unit: e.target.value })}
          />
        </>
      )}
      <div>
        <p className="mb-1 text-xs text-ink-3">Importance</p>
        <ImportancePicker value={form.importance} onChange={(importance) => patch({ importance })} />
      </div>
      {initial.kind !== form.kind && (
        <p className="text-xs text-amber-300">Changing the kind clears this dimension's scores.</p>
      )}
      {error && <FieldError message={error} />}
      <div className="flex gap-2">
        <button
          type="button"
          className="min-h-11 min-w-0 flex-1 rounded-xl bg-accent px-4 text-sm font-semibold text-on-accent"
          onClick={() => void submit()}
        >
          {submitLabel}
        </button>
        {onCancel && (
          <button
            type="button"
            className="min-h-11 min-w-0 flex-1 rounded-xl border border-hairline text-sm font-medium text-ink-3 hover:bg-hover"
            onClick={onCancel}
          >
            Cancel
          </button>
        )}
      </div>
    </div>
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
        <div key={d.id} className="rounded-xl border border-hairline bg-surface p-3">
          {editing === d.id ? (
            <DimensionForm
              initial={formOf(d)}
              submitLabel="Save"
              onSubmit={async (input) => {
                await updateDimension(d.id, input)
                setEditing(null)
              }}
              onCancel={() => setEditing(null)}
            />
          ) : (
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <div className="font-medium">{d.name}</div>
                <div className="mt-1 flex flex-wrap gap-1">
                  <Badge>{d.kind}</Badge>
                  {d.kind === 'objective' && <Badge>{d.direction} is better</Badge>}
                  {d.unit && <Badge>{d.unit}</Badge>}
                  <Badge>importance {d.importance}</Badge>
                </div>
              </div>
              <button
                type="button"
                className="min-h-11 rounded-md px-2 text-xs font-medium text-ink-3 hover:bg-hover"
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
          className="w-full rounded-xl border border-dashed border-hairline py-3 text-sm text-ink-3 hover:bg-hover"
          onClick={() => setAdding(true)}
        >
          + Add dimension
        </button>
      )}
    </div>
  )
}
