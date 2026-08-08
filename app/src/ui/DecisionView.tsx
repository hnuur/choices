import { useEffect, useState } from 'react'
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
