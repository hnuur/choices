import { useState, type ReactNode } from 'react'

/** Two-step destructive action: first tap arms, second tap confirms. */
export function ConfirmButton({
  label = 'Delete',
  onConfirm,
}: {
  label?: string
  onConfirm: () => void
}) {
  const [arming, setArming] = useState(false)
  if (!arming) {
    return (
      <button
        type="button"
        className="rounded-md px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
        onClick={() => setArming(true)}
      >
        {label}
      </button>
    )
  }
  return (
    <span className="inline-flex items-center gap-1">
      <button
        type="button"
        className="rounded-md bg-red-600 px-2 py-1 text-xs font-medium text-white"
        onClick={onConfirm}
      >
        Confirm
      </button>
      <button
        type="button"
        className="rounded-md px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100"
        onClick={() => setArming(false)}
      >
        Cancel
      </button>
    </span>
  )
}

export function Progress({ value, total }: { value: number; total: number }) {
  const percent = total === 0 ? 0 : Math.round((value / total) * 100)
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
      <div
        className="h-full rounded-full bg-sky-500 transition-all"
        style={{ width: `${percent}%` }}
      />
    </div>
  )
}

export function Badge({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{children}</span>
  )
}

export function ImportancePicker({
  value,
  onChange,
}: {
  value: number
  onChange: (importance: number) => void
}) {
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          className={`h-11 w-11 rounded-md text-sm font-medium ${
            n === value ? 'bg-sky-500 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          }`}
        >
          {n}
        </button>
      ))}
    </div>
  )
}

export function FieldError({ message }: { message: string }) {
  return <p className="mt-2 text-xs text-red-600">{message}</p>
}

export const inputClass =
  'w-full rounded-md border border-slate-300 bg-white px-3 py-2.5 text-base focus:border-sky-500 focus:outline-none'
