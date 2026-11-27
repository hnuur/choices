import { useRef, useState, type ChangeEvent } from 'react'
import { loadSettings } from '../ai/settings'
import { unlockSpeech } from '../ai/tts'
import { createDecision, deleteDecision, importDecision, ValidationError } from '../mutations'
import { queryHome, type HomeData } from '../queries'
import { rankOptions } from '../scoring'
import type { Decision, DecisionExport } from '../types'
import { useLiveQuery } from '../useLiveQuery'
import { ConfirmButton, FieldError, inputClass, Progress } from './bits'
import { pct, timeAgo } from './format'
import InstallHint from './InstallHint'
import RambleSheet from './RambleSheet'
import { entryTab, type Tab } from './tabs'

const STARTERS = ['Next camera', 'Where to live', 'Which offer']

const SORTS = [
  { id: 'recent', label: 'Recent' },
  { id: 'alpha', label: 'A–Z' },
] as const

type RowStatus = 'winner' | 'scoring' | 'draft'

function Row({
  decision,
  data,
  onOpen,
}: {
  decision: Decision
  data: HomeData
  onOpen: (id: string, tab: Tab) => void
}) {
  const dimensions = data.dimensions.filter((d) => d.decisionId === decision.id)
  const options = data.options.filter((o) => o.decisionId === decision.id)
  const optionIds = new Set(options.map((o) => o.id))
  const scores = data.scores.filter((s) => optionIds.has(s.optionId))
  const results = rankOptions(dimensions, options, scores)

  const winner = results.complete ? results.winner : undefined
  const status: RowStatus =
    winner ? 'winner' : results.totalCells > 0 ? 'scoring' : 'draft'
  const leading = winner
    ? `${winner.option.name} · ${pct(winner.total)}`
    : status === 'scoring'
      ? `${results.scoredCells} of ${results.totalCells} scored`
      : options.length === 0
        ? 'Add options to start'
        : 'Add dimensions to start'

  return (
    <li className="surface-card">
      <button
        type="button"
        aria-label={`Open ${decision.name}`}
        className="block min-h-11 w-full rounded-lg text-left"
        onClick={() => onOpen(decision.id, entryTab(dimensions, options, scores))}
      >
        <span className="flex items-start justify-between gap-3">
          <span className="text-lg leading-snug font-semibold">{decision.name}</span>
          <span aria-hidden="true" className="shrink-0 text-accent-ink">›</span>
        </span>
        <span className="mt-1 block text-sm text-ink-3">
          {dimensions.length} {dimensions.length === 1 ? 'dimension' : 'dimensions'} ·{' '}
          {options.length} {options.length === 1 ? 'option' : 'options'}
        </span>
      </button>
      {status === 'scoring' && (
        <div className="mt-3">
          <Progress value={results.scoredCells} total={results.totalCells} label="Scoring progress" />
        </div>
      )}
      <div className="mt-3 flex flex-wrap items-baseline gap-x-2 border-t border-divider pt-3 text-sm">
        <span className={`font-semibold ${winner ? 'text-accent-ink' : 'text-ink'}`}>
          {winner ? 'Winner' : status === 'scoring' ? 'Scoring' : 'Draft'}
        </span>
        <span className="min-w-0 text-ink-2">{leading}</span>
      </div>
      <div className="mt-1 flex flex-wrap items-center justify-between gap-x-2">
        <span className="text-xs text-ink-3">Edited {timeAgo(decision.updatedAt)}</span>
        <ConfirmButton onConfirm={() => void deleteDecision(decision.id)} />
      </div>
    </li>
  )
}

export default function Home({ onOpen }: { onOpen: (id: string, tab: Tab) => void }) {
  const data = useLiveQuery(queryHome, [])
  const [name, setName] = useState('')
  const [createError, setCreateError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)
  const [rambleOpen, setRambleOpen] = useState(false)
  const [rambleSeed, setRambleSeed] = useState<string | undefined>()
  const [sort, setSort] = useState<(typeof SORTS)[number]['id']>('recent')
  const fileRef = useRef<HTMLInputElement>(null)

  const openRamble = () => {
    const text = name.trim()
    setRambleSeed(text || undefined)
    if (text) setName('')
    setCreateError(null)
    if (loadSettings().voiceReplies) unlockSpeech()
    setRambleOpen(true)
  }

  const create = async () => {
    if (creating) return
    const trimmed = name.trim()
    if (!trimmed) {
      setCreateError('Name the decision first.')
      return
    }
    setCreating(true)
    try {
      const decision = await createDecision(trimmed)
      setName('')
      setCreateError(null)
      onOpen(decision.id, 'dimensions')
    } catch (error) {
      setCreateError(error instanceof ValidationError ? error.message : 'Could not save this decision. Try again.')
    } finally {
      setCreating(false)
    }
  }

  const onImportFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-picking the same file after an error
    if (!file) return
    try {
      const exported = JSON.parse(await file.text()) as DecisionExport
      const id = await importDecision(exported)
      setImportError(null)
      onOpen(id, entryTab(exported.dimensions, exported.options, exported.scores))
    } catch (err) {
      setImportError(
        err instanceof ValidationError
          ? err.message
          : 'not a Choices backup file (invalid JSON)',
      )
    }
  }

  return (
    <main className="page-content py-6 pb-[calc(2rem+env(safe-area-inset-bottom))] sm:pt-10">
      <header className="mb-6">
        <h1 className="page-title">Choices</h1>
        <p className="mt-2 max-w-prose text-ink-2">Compare your options and weigh what matters.</p>
      </header>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(16rem,0.85fr)_minmax(0,1.3fr)] lg:gap-8">
        <section className="surface-card" aria-labelledby="new-decision">
          <h2 id="new-decision" className="section-title">New decision</h2>
          <form
            className="mt-4"
            onSubmit={(event) => {
              event.preventDefault()
              void create()
            }}
          >
            <label className="field-label" htmlFor="choice-name">Decision name</label>
            <input
              id="choice-name"
              className={inputClass}
              placeholder="What are you deciding?"
              value={name}
              aria-invalid={!!createError}
              aria-describedby={createError ? 'choice-name-error' : undefined}
              onChange={(event) => {
                setName(event.target.value)
                if (createError) setCreateError(null)
              }}
            />
            {createError && <FieldError id="choice-name-error" message={createError} />}
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="submit" className="primary-action flex-1" disabled={creating}>{creating ? 'Saving…' : 'Create'}</button>
              <button type="button" aria-label="Ramble" className="secondary-action" disabled={creating} onClick={openRamble}>
                Ramble
              </button>
            </div>
          </form>

          <div className="mt-4 flex flex-wrap gap-1 border-t border-divider pt-2" aria-label="Decision starters">
            {STARTERS.map((starter) => (
              <button key={starter} type="button" className="text-action text-xs" onClick={() => setName(starter)}>
                {starter}
              </button>
            ))}
          </div>
          <InstallHint />
        </section>

        <section className="min-w-0" aria-labelledby="saved-decisions">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
            <h2 id="saved-decisions" className="section-title">Your decisions{data ? ` · ${data.decisions.length}` : ''}</h2>
            {data && data.decisions.length > 1 && (
              <select
                aria-label="Sort decisions"
                className="min-h-11 max-w-full rounded-xl border border-hairline bg-surface px-3 text-sm text-ink"
                value={sort}
                onChange={(event) => setSort(event.target.value as typeof sort)}
              >
                {SORTS.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
              </select>
            )}
          </div>
          {data === undefined ? (
            <p role="status" className="surface-card text-ink-3">Loading decisions…</p>
          ) : data.decisions.length === 0 ? (
            <p className="surface-card text-ink-2">Your saved decisions will appear here.</p>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
              {(sort === 'recent'
                ? data.decisions
                : [...data.decisions].sort((a, b) => a.name.localeCompare(b.name))
              ).map((decision) => (
                <Row key={decision.id} decision={decision} data={data} onOpen={onOpen} />
              ))}
            </ul>
          )}
          <footer className="mt-4 flex flex-wrap items-center justify-between gap-x-3 border-t border-divider pt-2">
            <p className="text-sm text-ink-3">Decisions are stored on this device.</p>
            <button type="button" className="text-action" onClick={() => fileRef.current?.click()}>
              Import backup
            </button>
            <input ref={fileRef} type="file" accept="application/json,.json" className="hidden"
              onChange={(event) => void onImportFile(event)} />
            {importError && <FieldError message={importError} />}
          </footer>
        </section>
      </div>

      {rambleOpen && (
        <RambleSheet
          initialText={rambleSeed}
          onClose={() => {
            setRambleOpen(false)
            setRambleSeed(undefined)
          }}
          onCreated={(id, tab) => {
            setRambleOpen(false)
            setRambleSeed(undefined)
            onOpen(id, tab)
          }}
        />
      )}
    </main>
  )
}
