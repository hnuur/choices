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
        className="min-h-11 rounded-md px-2 text-xs font-medium text-ink-4 hover:bg-hover hover:text-red-400"
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
        className="min-h-11 rounded-md bg-red-500 px-3 text-xs font-medium text-ink"
        onClick={onConfirm}
      >
        Confirm
      </button>
      <button
        type="button"
        className="min-h-11 rounded-md px-2 text-xs font-medium text-ink-3 hover:bg-hover"
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
    <div className="h-1 w-full overflow-hidden rounded-full bg-hairline">
      <div
        className="h-full rounded-full bg-accent transition-all"
        style={{ width: `${percent}%` }}
      />
    </div>
  )
}

export function Badge({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-full border border-hairline bg-hover px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.08em] text-ink-2">
      {children}
    </span>
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
          className={`h-11 w-11 rounded-lg text-sm font-medium ${
            n === value ? 'bg-accent font-semibold text-on-accent' : 'bg-hover text-ink-2 hover:bg-white/9'
          }`}
        >
          {n}
        </button>
      ))}
    </div>
  )
}

export function FieldError({ message }: { message: string }) {
  return <p className="mt-2 text-xs text-red-400">{message}</p>
}

export const inputClass =
  'w-full rounded-xl border border-hairline bg-surface-2 px-3 py-2.5 text-base text-ink placeholder:text-ink-4 focus:border-accent focus:outline-none'
