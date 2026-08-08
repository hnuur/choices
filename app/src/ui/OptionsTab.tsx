import { useState } from 'react'
import { ValidationError, addOption, deleteOption, updateOption } from '../mutations'
import type { DecisionBundle } from '../queries'
import type { Option, OptionInput } from '../types'
import { ConfirmButton, FieldError, inputClass } from './bits'

function OptionForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial: { name: string; notes: string }
  submitLabel: string
  onSubmit: (input: OptionInput) => Promise<void>
  onCancel?: () => void
}) {
  const [form, setForm] = useState(initial)
  const [error, setError] = useState('')

  const submit = async () => {
    try {
      setError('')
      await onSubmit({ name: form.name, notes: form.notes.trim() || undefined })
    } catch (e) {
      setError(e instanceof ValidationError ? e.message : String(e))
    }
  }

  return (
    <div className="space-y-3 rounded-xl bg-slate-50 p-3">
      <input
        className={inputClass}
        placeholder="Option name — e.g. Sony A7C II"
        value={form.name}
        onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
      />
      <textarea
        className={inputClass}
        placeholder="Notes (optional)"
        rows={2}
        value={form.notes}
        onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
      />
      {error && <FieldError message={error} />}
      <div className="flex gap-2">
        <button
          type="button"
          className="rounded-md bg-sky-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-600"
          onClick={() => void submit()}
        >
          {submitLabel}
        </button>
        {onCancel && (
          <button
            type="button"
            className="rounded-md px-3 py-1.5 text-sm text-slate-500 hover:bg-slate-100"
            onClick={onCancel}
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  )
}

const formOf = (o: Option) => ({ name: o.name, notes: o.notes ?? '' })

export default function OptionsTab({ bundle }: { bundle: DecisionBundle }) {
  const [adding, setAdding] = useState(bundle.options.length === 0)
  const [editing, setEditing] = useState<string | null>(null)
  const [formKey, setFormKey] = useState(0)

  return (
    <div className="space-y-2">
      {bundle.options.map((o) => (
        <div key={o.id} className="rounded-xl bg-white p-3 shadow-sm">
          {editing === o.id ? (
            <OptionForm
              initial={formOf(o)}
              submitLabel="Save"
              onSubmit={async (input) => {
                await updateOption(o.id, input)
                setEditing(null)
              }}
              onCancel={() => setEditing(null)}
            />
          ) : (
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <div className="font-medium">{o.name}</div>
                {o.notes && (
                  <p className="mt-0.5 whitespace-pre-wrap text-xs text-slate-500">{o.notes}</p>
                )}
              </div>
              <button
                type="button"
                className="rounded-md px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100"
                onClick={() => setEditing(o.id)}
              >
                Edit
              </button>
              <ConfirmButton onConfirm={() => void deleteOption(o.id)} />
            </div>
          )}
        </div>
      ))}

      {adding ? (
        <OptionForm
          key={formKey}
          initial={{ name: '', notes: '' }}
          submitLabel="Add option"
          onSubmit={async (input) => {
            await addOption(bundle.decision.id, input)
            setFormKey((k) => k + 1)
          }}
          onCancel={bundle.options.length > 0 ? () => setAdding(false) : undefined}
        />
      ) : (
        <button
          type="button"
          className="w-full rounded-xl border border-dashed border-slate-300 py-2.5 text-sm text-slate-500 hover:bg-slate-100"
          onClick={() => setAdding(true)}
        >
          + Add option
        </button>
      )}
    </div>
  )
}
