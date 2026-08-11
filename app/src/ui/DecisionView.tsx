import { useEffect, useState } from 'react'
import { exportDecision } from '../mutations'
import { queryDecision } from '../queries'
import { useLiveQuery } from '../useLiveQuery'
import ChatSheet, { type ChatState } from './ChatSheet'
import DimensionsTab from './DimensionsTab'
import OptionsTab from './OptionsTab'
import ResultsTab from './ResultsTab'
import ScoreTab from './ScoreTab'
import { TABS, type Tab } from './tabs'

const stamp = () =>
  new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

export default function DecisionView({ id, onBack }: { id: string; onBack: () => void }) {
  const bundle = useLiveQuery(() => queryDecision(id), [id])
  const [tab, setTab] = useState<Tab>('dimensions')
  const [exportNote, setExportNote] = useState<string | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [chatState, setChatState] = useState<ChatState>('closed')
  const [aiStatus, setAiStatus] = useState<string | null>(null)

  // The chip in the sheet header cycles the tab the AI is looking at.
  const cycleTab = () => {
    const index = TABS.findIndex((t) => t.id === tab)
    setTab(TABS[(index + 1) % TABS.length].id)
  }

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
      // iOS Safari only fetches the blob once the user confirms its download
      // dialog, so an immediate revoke kills the download (seen on iOS 18.2).
      setTimeout(() => URL.revokeObjectURL(url), 60_000)
      setExportNote(`Backup saved · ${stamp()}`)
    } catch {
      setExportNote('Export failed.')
    }
  }

  // null (not undefined) means loaded-but-absent: the decision was deleted.
  useEffect(() => {
    if (bundle === null) onBack()
  }, [bundle, onBack])

  if (bundle === undefined) {
    return <p className="mt-8 text-center text-sm text-ink-3">Loading…</p>
  }
  if (bundle === null) return null

  return (
    <main className="mx-auto max-w-md px-4 pb-44 pt-3">
      <button
        type="button"
        className="min-h-11 text-sm text-ink-3 hover:text-ink-2"
        onClick={onBack}
      >
        ← All decisions
      </button>

      <div className="flex items-center justify-between gap-3">
        <h1 className="min-w-0 flex-1 truncate text-[34px] font-bold leading-[1.15] tracking-[-1.2px]">
          {bundle.decision.name}
        </h1>
        <div className="relative shrink-0">
          {/* 38×38 visual inside a 44×44 hit area */}
          <button
            type="button"
            aria-label="More actions"
            className="flex h-11 w-11 items-center justify-center"
            onClick={() => setMenuOpen((v) => !v)}
          >
            <span className="flex h-[38px] w-[38px] items-center justify-center rounded-xl border border-hairline bg-hover text-sm tracking-[0.14em] text-ink-2">
              •••
            </span>
          </button>
          {menuOpen && (
            <>
              <button
                type="button"
                aria-label="Close menu"
                tabIndex={-1}
                className="fixed inset-0 z-30 cursor-default"
                onClick={() => setMenuOpen(false)}
              />
              <div className="absolute right-0 z-40 mt-1 w-[206px] rounded-[14px] border border-hairline bg-menu p-1.5">
                <button
                  type="button"
                  className="block w-full rounded-lg px-3 py-3 text-left text-sm text-ink-2 hover:bg-hover"
                  onClick={() => {
                    setMenuOpen(false)
                    setTab('dimensions')
                  }}
                >
                  Edit dimensions
                </button>
                <button
                  type="button"
                  className="block w-full rounded-lg px-3 py-3 text-left text-sm text-ink-2 hover:bg-hover"
                  onClick={() => {
                    setMenuOpen(false)
                    void exportBackup()
                  }}
                >
                  Export backup (.json)
                </button>
                {exportNote && (
                  <p className="mt-1 border-t border-hairline px-3 pb-1 pt-2 font-mono text-[10px] uppercase tracking-[0.1em] text-ink-4">
                    {exportNote}
                  </p>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.12em] text-ink-3">
        {bundle.dimensions.length} dimensions · {bundle.options.length} options
      </p>

      <div className="mt-4 flex gap-5 border-b border-divider">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`-mb-px min-h-11 border-b-2 px-0.5 text-[15px] ${
              tab === t.id
                ? 'border-accent font-semibold text-ink'
                : 'border-transparent font-medium text-ink-3 hover:text-ink-2'
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

      {/* Fixed action bar: Ask AI entry point + AI status line; doubles as
          the chat sheet's peek surface after approve. */}
      <div className="fixed inset-x-0 bottom-0 z-30 bg-gradient-to-t from-bg via-bg/80 to-transparent backdrop-blur-xl">
        <div
          className="mx-auto max-w-md px-4 pt-8"
          style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 0.75rem)' }}
        >
          {aiStatus && <p className="pb-2 text-center text-xs text-ink-3">{aiStatus}</p>}
          <button
            type="button"
            className="min-h-[52px] w-full rounded-2xl bg-gradient-to-b from-accent-ink to-accent text-[15.5px] font-semibold text-on-accent"
            onClick={() => setChatState('full')}
          >
            Ask AI
          </button>
        </div>
      </div>

      <ChatSheet
        bundle={bundle}
        tab={tab}
        state={chatState}
        onStateChange={setChatState}
        onCycleTab={cycleTab}
        onApplied={() => setAiStatus(`Changes applied · ${stamp()}`)}
      />
    </main>
  )
}
