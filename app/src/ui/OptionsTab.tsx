import { useState } from 'react'
import { ValidationError, addOption, deleteOption, updateOption } from '../mutations'
import type { DecisionBundle } from '../queries'
import type { Option, OptionInput } from '../types'
import { ConfirmButton, Field, FieldError, inputClass } from './bits'

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
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    if (saving) return
    setSaving(true)
    try {
      setError('')
      await onSubmit({ name: form.name, notes: form.notes.trim() || undefined })
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
      <Field label="Option name">
        <input
          className={inputClass}
          placeholder="For example, Sony A7C II"
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
        />
      </Field>
      <Field label="Notes (optional)">
        <textarea
          className={inputClass}
          placeholder="Add details about this option"
          rows={2}
          value={form.notes}
          onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
        />
      </Field>
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

const formOf = (o: Option) => ({ name: o.name, notes: o.notes ?? '' })

export default function OptionsTab({ bundle }: { bundle: DecisionBundle }) {
  const [adding, setAdding] = useState(bundle.options.length === 0)
  const [editing, setEditing] = useState<string | null>(null)
  const [formKey, setFormKey] = useState(0)

  return (
    <div className="space-y-2">
      {bundle.options.map((o) => (
        <div key={o.id} className="surface-card">
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
            <div className="flex flex-wrap items-start gap-x-2 gap-y-1">
              <div className="min-w-0 flex-1 basis-36">
                <div className="text-lg leading-snug font-semibold">{o.name}</div>
                {o.notes && (
                  <p className="mt-1 whitespace-pre-wrap text-sm text-ink-2">{o.notes}</p>
                )}
              </div>
              <button
                type="button"
                className="text-action"
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
          className="secondary-action"
          onClick={() => setAdding(true)}
        >
          + Add option
        </button>
      )}
    </div>
  )
}
