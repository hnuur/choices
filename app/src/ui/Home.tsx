import { useRef, useState, type ChangeEvent } from 'react'
import { createDecision, deleteDecision, importDecision, ValidationError } from '../mutations'
import { queryHome, type HomeData } from '../queries'
import { rankOptions } from '../scoring'
import type { Decision, DecisionExport } from '../types'
import { useLiveQuery } from '../useLiveQuery'
import { ConfirmButton, FieldError, inputClass } from './bits'
import { timeAgo } from './format'
import InstallHint from './InstallHint'

function Preview({ decisionId, data }: { decisionId: string; data: HomeData }) {
  const dimensions = data.dimensions.filter((d) => d.decisionId === decisionId)
  const options = data.options.filter((o) => o.decisionId === decisionId)
  const optionIds = new Set(options.map((o) => o.id))
  const scores = data.scores.filter((s) => optionIds.has(s.optionId))
  const results = rankOptions(dimensions, options, scores)

  if (results.complete && results.winner) {
    return (
      <span className="font-medium text-sky-700">
        → {results.winner.option.name}
        {results.nearTie ? ' (near tie)' : ''}
      </span>
    )
  }
  if (results.totalCells > 0) {
    return (
      <span className="text-slate-500">
        {results.scoredCells}/{results.totalCells} scored
      </span>
    )
  }
  return <span className="text-slate-400">no dimensions or options yet</span>
}

export default function Home({ onOpen }: { onOpen: (id: string) => void }) {
  const data = useLiveQuery(queryHome, [])
  const [name, setName] = useState('')
  const [importError, setImportError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const create = async () => {
    const trimmed = name.trim()
    if (!trimmed) return
    const decision = await createDecision(trimmed)
    setName('')
    onOpen(decision.id)
  }

  const onImportFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-picking the same file after an error
    if (!file) return
    try {
      const id = await importDecision(JSON.parse(await file.text()) as DecisionExport)
      setImportError(null)
      onOpen(id)
    } catch (err) {
      setImportError(
        err instanceof ValidationError
          ? err.message
          : 'not a Choices backup file (invalid JSON)',
      )
    }
  }

  return (
    <main className="mx-auto max-w-md px-4 py-6">
      <h1 className="text-2xl font-bold">Choices</h1>
      <p className="mt-1 text-sm text-slate-500">Choose between instances of a thing.</p>

      <div className="mt-4 flex gap-2">
        <input
          className={inputClass}
          placeholder="New decision — e.g. “Next camera”"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void create()
          }}
        />
        <button
          type="button"
          className="shrink-0 rounded-md bg-sky-500 px-4 py-2 text-sm font-medium text-white hover:bg-sky-600"
          onClick={() => void create()}
        >
          Create
        </button>
      </div>

      <div className="mt-2">
        <button
          type="button"
          className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100"
          onClick={() => fileRef.current?.click()}
        >
          Import backup (.json)
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => void onImportFile(e)}
        />
        {importError && <FieldError message={importError} />}
      </div>

      <InstallHint />

      {data === undefined ? (
        <p className="mt-8 text-center text-sm text-slate-400">Loading…</p>
      ) : data.decisions.length === 0 ? (
        <p className="mt-8 text-center text-sm text-slate-400">
          No decisions yet — create one above.
        </p>
      ) : (
        <ul className="mt-4 space-y-2">
          {data.decisions.map((decision: Decision) => (
            <li
              key={decision.id}
              className="flex items-center gap-2 rounded-xl bg-white p-3 shadow-sm"
            >
              <button
                type="button"
                className="min-w-0 flex-1 text-left"
                onClick={() => onOpen(decision.id)}
              >
                <div className="truncate font-medium">{decision.name}</div>
                <div className="mt-0.5 text-xs text-slate-500">
                  {data.options.filter((o) => o.decisionId === decision.id).length} options ·{' '}
                  <Preview decisionId={decision.id} data={data} /> · edited{' '}
                  {timeAgo(decision.updatedAt)}
                </div>
              </button>
              <ConfirmButton onConfirm={() => void deleteDecision(decision.id)} />
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
