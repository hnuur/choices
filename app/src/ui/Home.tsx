import { useRef, useState, type ChangeEvent } from 'react'
import { loadSettings } from '../ai/settings'
import { unlockSpeech } from '../ai/tts'
import { createDecision, deleteDecision, importDecision, ValidationError } from '../mutations'
import { queryHome, type HomeData } from '../queries'
import { rankOptions } from '../scoring'
import type { Decision, DecisionExport } from '../types'
import { useLiveQuery } from '../useLiveQuery'
import { ConfirmButton, FieldError } from './bits'
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
  const percent =
    results.totalCells === 0
      ? 0
      : Math.round((results.scoredCells / results.totalCells) * 100)

  const leading = winner
    ? `${winner.option.name} · ${pct(winner.total)}`
    : status === 'scoring'
      ? `${results.scoredCells} of ${results.totalCells} scored`
      : options.length === 0
        ? 'Add options to start'
        : 'Add dimensions to start'

  return (
    <li className="relative rounded-2xl border border-hairline bg-surface p-4">
      {/* full-card tap target; Delete sits above it */}
      <button
        type="button"
        aria-label={`Open ${decision.name}`}
        className="absolute inset-0 z-0 rounded-2xl"
        onClick={() => onOpen(decision.id, entryTab(dimensions, options, scores))}
      />
      <div className="flex items-baseline justify-between gap-3">
        <div className="min-w-0 flex-1 truncate text-[17px] font-bold tracking-[-0.3px]">
          {decision.name}
        </div>
        <span className="shrink-0 font-mono text-[11px] uppercase tracking-[0.12em] text-ink-4">
          {timeAgo(decision.updatedAt)}
        </span>
      </div>
      <div className="mt-3 flex items-center gap-3">
        <div className="h-[3px] min-w-0 flex-1 overflow-hidden rounded-full bg-hairline">
          <div
            className={`h-full rounded-full ${status === 'draft' ? 'bg-bar-dim' : 'bg-accent'}`}
            style={{ width: status === 'draft' ? '24px' : `${percent}%` }}
          />
        </div>
        <span className="shrink-0 font-mono text-[11px] uppercase tracking-[0.12em] text-ink-3">
          {dimensions.length} dim · {options.length} opt
        </span>
      </div>
      <div className="mt-3 flex items-center gap-2">
        <span
          className={`shrink-0 rounded-md px-2 py-1 font-mono text-[10px] uppercase tracking-[0.08em] ${
            status === 'winner'
              ? 'bg-accent font-semibold text-on-accent'
              : 'bg-hover text-ink-3'
          }`}
        >
          {status}
        </span>
        <div
          className={`min-w-0 flex-1 truncate text-sm ${
            status === 'winner'
              ? 'font-medium text-ink'
              : status === 'scoring'
                ? 'text-ink-2'
                : 'text-ink-3'
          }`}
        >
          {leading}
        </div>
        <div className="relative z-10">
          <ConfirmButton onConfirm={() => void deleteDecision(decision.id)} />
        </div>
      </div>
    </li>
  )
}

export default function Home({ onOpen }: { onOpen: (id: string, tab: Tab) => void }) {
  const data = useLiveQuery(queryHome, [])
  const [name, setName] = useState('')
  const [createError, setCreateError] = useState<string | null>(null)
  const [importError, setImportError] = useState<string | null>(null)
  const [rambleOpen, setRambleOpen] = useState(false)
  const [rambleSeed, setRambleSeed] = useState<string | undefined>()
  const [sort, setSort] = useState<(typeof SORTS)[number]['id']>('recent')
  const [sortOpen, setSortOpen] = useState(false)
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
    const trimmed = name.trim()
    if (!trimmed) {
      setCreateError('Name the decision first.')
      return
    }
    const decision = await createDecision(trimmed)
    setName('')
    setCreateError(null)
    onOpen(decision.id, 'dimensions')
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
    <main className="mx-auto max-w-md px-4 py-6 pb-24">
      <h1 className="text-[34px] font-bold leading-[1.15] tracking-[-1.2px]">Choices</h1>
      <p className="mt-1 text-sm text-ink-3">
        Weigh what matters, then decide with the numbers in front of you.
      </p>

      <div className="mt-5 flex items-center gap-2 rounded-2xl border border-hairline bg-surface py-1.5 pl-4 pr-1.5 focus-within:border-accent">
        <input
          className="min-w-0 flex-1 bg-transparent text-base text-ink placeholder:text-ink-4 focus:outline-none"
          placeholder="What are you deciding?"
          value={name}
          onChange={(e) => {
            setName(e.target.value)
            if (createError) setCreateError(null)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void create()
          }}
        />
        <button
          type="button"
          aria-label="Ramble"
          className="flex min-h-[46px] shrink-0 items-center justify-center gap-2 rounded-xl px-3 text-sm font-medium text-ink-2 hover:bg-hover"
          onClick={openRamble}
        >
          <span className="size-1.5 rounded-full bg-accent" />
          Ramble
        </button>
        <button
          type="button"
          className="min-h-[46px] shrink-0 rounded-xl bg-gradient-to-b from-accent-ink to-accent px-5 text-[15px] font-semibold text-on-accent shadow-[0_0_24px_rgb(90_208_240/0.35)]"
          onClick={() => void create()}
        >
          Create
        </button>
      </div>
      {createError && <FieldError message={createError} />}

      <div className="mt-3 flex flex-wrap gap-2">
        {STARTERS.map((starter) => (
          <button
            key={starter}
            type="button"
            className="min-h-11 rounded-full border border-dashed border-divider px-4 text-sm text-ink-2 hover:bg-hover"
            onClick={() => setName(starter)}
          >
            {starter}
          </button>
        ))}
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={(e) => void onImportFile(e)}
      />
      {importError && <FieldError message={importError} />}

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

      <InstallHint />

      {data === undefined ? (
        <p className="mt-8 text-center text-sm text-ink-3">Loading…</p>
      ) : (
        <>
          <div className="mt-8 flex items-center justify-between">
            <h2 className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-3">
              Your decisions · {data.decisions.length}
            </h2>
            <div className="relative">
              <button
                type="button"
                className="min-h-11 font-mono text-[11px] uppercase tracking-[0.14em] text-ink-3 hover:text-ink-2"
                onClick={() => setSortOpen((v) => !v)}
              >
                {SORTS.find((s) => s.id === sort)?.label} ▾
              </button>
              {sortOpen && (
                <>
                  <button
                    type="button"
                    aria-label="Close sort menu"
                    tabIndex={-1}
                    className="fixed inset-0 z-30 cursor-default"
                    onClick={() => setSortOpen(false)}
                  />
                  <div className="absolute right-0 z-40 mt-1 w-[140px] rounded-[14px] border border-hairline bg-menu p-1.5">
                    {SORTS.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        className="block w-full rounded-lg px-3 py-3 text-left text-sm text-ink-2 hover:bg-hover"
                        onClick={() => {
                          setSort(s.id)
                          setSortOpen(false)
                        }}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>

          {data.decisions.length === 0 ? (
            <p className="mt-6 text-center text-sm text-ink-3">
              No decisions yet — create one above.
            </p>
          ) : (
            <ul className="mt-3 space-y-3">
              {(sort === 'recent'
                ? data.decisions
                : [...data.decisions].sort((a, b) => a.name.localeCompare(b.name))
              ).map((decision) => (
                <Row key={decision.id} decision={decision} data={data} onOpen={onOpen} />
              ))}
            </ul>
          )}

          <div className="mt-6 rounded-2xl border border-dashed border-divider px-6 py-5 text-center">
            <p className="text-sm leading-relaxed text-ink-3">
              Decisions stay on this device. Export a backup to keep them.
            </p>
            <button
              type="button"
              className="mt-1 min-h-11 text-xs text-ink-4 hover:text-ink-3"
              onClick={() => fileRef.current?.click()}
            >
              Import backup
            </button>
          </div>
        </>
      )}
    </main>
  )
}
