import { useEffect, useState } from 'react'
import { exportDecision } from '../mutations'
import { queryDecision } from '../queries'
import { useLiveQuery } from '../useLiveQuery'
import DimensionsTab from './DimensionsTab'
import OptionsTab from './OptionsTab'
import ResultsTab from './ResultsTab'
import ScoreTab from './ScoreTab'

export type Tab = 'dimensions' | 'options' | 'score' | 'results'

const TABS: { id: Tab; label: string }[] = [
  { id: 'dimensions', label: 'Dimensions' },
  { id: 'options', label: 'Options' },
  { id: 'score', label: 'Score' },
  { id: 'results', label: 'Results' },
]

export default function DecisionView({ id, onBack }: { id: string; onBack: () => void }) {
  const bundle = useLiveQuery(() => queryDecision(id), [id])
  const [tab, setTab] = useState<Tab>('dimensions')
  const [exportNote, setExportNote] = useState<string | null>(null)

  const exportBackup = async () => {
    if (!bundle) return
    try {
      const exported = await exportDecision(id)
      const blob = new Blob([JSON.stringify(exported, null, 2)], {
        type: 'application/json',
      })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `choices-${bundle.decision.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'decision'}.json`
      a.click()
      URL.revokeObjectURL(url)
      setExportNote('Backup saved.')
    } catch {
      setExportNote('Export failed.')
    }
  }

  // null (not undefined) means loaded-but-absent: the decision was deleted.
  useEffect(() => {
    if (bundle === null) onBack()
  }, [bundle, onBack])

  if (bundle === undefined) {
    return <p className="mt-8 text-center text-sm text-slate-400">Loading…</p>
  }
  if (bundle === null) return null

  return (
    <main className="mx-auto max-w-md px-4 py-6">
      <button
        type="button"
        className="text-sm text-slate-500 hover:text-slate-800"
        onClick={onBack}
      >
        ← All decisions
      </button>
      <h1 className="mt-1 text-2xl font-bold">{bundle.decision.name}</h1>
      <p className="mt-0.5 text-xs text-slate-500">
        {bundle.dimensions.length} dimensions · {bundle.options.length} options
      </p>

      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100"
          onClick={() => void exportBackup()}
        >
          Export backup (.json)
        </button>
        {exportNote && <span className="text-xs text-slate-500">{exportNote}</span>}
      </div>

      <div className="mt-4 flex gap-1 rounded-lg bg-slate-200/70 p-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`flex-1 rounded-md px-2 py-1.5 text-sm font-medium ${
              tab === t.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="mt-4">
        {tab === 'dimensions' && <DimensionsTab bundle={bundle} />}
        {tab === 'options' && <OptionsTab bundle={bundle} />}
        {tab === 'score' && <ScoreTab bundle={bundle} />}
        {tab === 'results' && <ResultsTab bundle={bundle} onGoScore={() => setTab('score')} />}
      </div>
    </main>
  )
}
