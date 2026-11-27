import { useEffect, useRef, useState } from 'react'
import { loadSettings } from '../ai/settings'
import { unlockSpeech } from '../ai/tts'
import { ValidationError, exportDecision, renameDecision } from '../mutations'
import { queryDecision } from '../queries'
import { useLiveQuery } from '../useLiveQuery'
import ChatSheet, { type ChatState } from './ChatSheet'
import DimensionsTab from './DimensionsTab'
import OptionsTab from './OptionsTab'
import RambleSheet from './RambleSheet'
import ResultsTab from './ResultsTab'
import ScoreTab from './ScoreTab'
import { Field, FieldError, inputClass } from './bits'
import { TABS, type Tab } from './tabs'

function DecisionTitle({ id, name }: { id: string; name: string }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(name)
  const [error, setError] = useState('')
  const skipSave = useRef(false)

  const save = async () => {
    if (skipSave.current) {
      skipSave.current = false
      return
    }
    const trimmed = draft.trim()
    if (trimmed === name) {
      setEditing(false)
      setError('')
      return
    }
    if (!trimmed) {
      setError('Name the decision first.')
      return
    }
    try {
      await renameDecision(id, trimmed)
      setEditing(false)
      setError('')
    } catch (e) {
      setError(e instanceof ValidationError ? e.message : String(e))
    }
  }

  if (!editing) {
    return (
      <h1 className="min-w-0 flex-1">
        <button
          type="button"
          aria-label={`Rename ${name}`}
          className="page-title min-h-11 w-full rounded-lg text-left"
          onClick={() => {
            skipSave.current = false
            setDraft(name)
            setError('')
            setEditing(true)
          }}
        >
          {name}
        </button>
      </h1>
    )
  }

  return (
    <div className="min-w-0 flex-1">
      <Field label="Decision name">
        <input
          className={inputClass}
          value={draft}
          autoFocus
          onChange={(e) => {
            setDraft(e.target.value)
            if (error) setError('')
          }}
          onBlur={() => void save()}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) e.currentTarget.blur()
            if (e.key === 'Escape') {
              skipSave.current = true
              setDraft(name)
              setError('')
              setEditing(false)
            }
          }}
        />
      </Field>
      {error && <FieldError message={error} />}
    </div>
  )
}

const stamp = () =>
  new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

export default function DecisionView({
  id,
  initialTab,
  onBack,
}: {
  id: string
  initialTab: Tab
  onBack: () => void
}) {
  const bundle = useLiveQuery(() => queryDecision(id), [id])
  const [tab, setTab] = useState<Tab>(initialTab)
  const [exportNote, setExportNote] = useState<string | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const menuButton = useRef<HTMLButtonElement>(null)
  const [chatState, setChatState] = useState<ChatState>('closed')
  const [aiStatus, setAiStatus] = useState<string | null>(null)
  const [rambleOpen, setRambleOpen] = useState(false)
  const [injection, setInjection] = useState<{ text: string; nonce: number } | null>(null)

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
    <main className="page-content pb-[calc(8rem+env(safe-area-inset-bottom))] pt-3 sm:pt-6">
      <header className="mb-5">
        <button
          type="button"
          className="text-action -ml-2.5"
          onClick={onBack}
        >
          ← All decisions
        </button>

        <div className="mt-1 flex items-start justify-between gap-3">
          <DecisionTitle id={id} name={bundle.decision.name} />
          <div className="relative shrink-0" onKeyDown={(event) => {
            if (event.key === 'Escape' && menuOpen) {
              setMenuOpen(false)
              menuButton.current?.focus()
            }
          }}>
            <button
              type="button"
              ref={menuButton}
              aria-label="More actions"
              aria-expanded={menuOpen}
              className="secondary-action icon-action"
              onClick={() => setMenuOpen((v) => !v)}
            >
              <span aria-hidden="true">•••</span>
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
                <div className="absolute right-0 z-40 mt-1 w-52 max-w-[calc(100vw-2rem)] rounded-xl border border-hairline bg-menu p-1.5">
                  <button
                    type="button"
                    className="block min-h-11 w-full rounded-lg px-3 py-2 text-left text-sm text-ink hover:bg-hover"
                    onClick={() => {
                      setMenuOpen(false)
                      setTab('dimensions')
                    }}
                  >
                    Edit dimensions
                  </button>
                  <button
                    type="button"
                    className="block min-h-11 w-full rounded-lg px-3 py-2 text-left text-sm text-ink hover:bg-hover"
                    onClick={() => {
                      setMenuOpen(false)
                      void exportBackup()
                    }}
                  >
                    Export backup (.json)
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        <p className="mt-2 text-sm text-ink-3">
          {bundle.dimensions.length} dimensions · {bundle.options.length} options
        </p>
        {exportNote && (
          <p role="status" className="mt-1 text-sm text-ink-3">
            {exportNote}
          </p>
        )}
      </header>

      <div className="grid items-start gap-4 lg:grid-cols-[11rem_minmax(0,1fr)] lg:gap-6">
        <nav aria-label="Decision sections" className="segmented lg:flex-col lg:[&>button]:text-left">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              aria-current={tab === t.id ? 'true' : undefined}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </nav>

        <section aria-labelledby="decision-section">
          <h2 id="decision-section" className="section-title mb-3">{TABS.find((item) => item.id === tab)?.label}</h2>
          {tab === 'dimensions' && <DimensionsTab bundle={bundle} />}
          {tab === 'options' && <OptionsTab bundle={bundle} />}
          {tab === 'score' && <ScoreTab bundle={bundle} />}
          {tab === 'results' && <ResultsTab bundle={bundle} onGoScore={() => setTab('score')} />}
        </section>
      </div>

      {/* Fixed action bar: Ask AI entry point + AI status line; doubles as
          the chat sheet's peek surface after approve. */}
      <div className="action-bar fixed inset-x-0 bottom-0 z-30">
        <div
          className="page-content flex flex-wrap items-center justify-end gap-2 pt-2"
          style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 0.75rem)' }}
        >
          {aiStatus && <p role="status" className="mr-auto text-sm text-ink-3">{aiStatus}</p>}
          <div className="flex w-full flex-wrap gap-2 sm:w-auto">
            <button
              type="button"
              aria-label="Ramble"
              className="secondary-action flex-1 sm:flex-none"
              onClick={() => {
                if (loadSettings().voiceReplies) unlockSpeech()
                setRambleOpen(true)
              }}
            >
              Ramble
            </button>
            <button
              type="button"
              aria-label="Ask AI"
              className="primary-action flex-1 sm:flex-none"
              onClick={() => setChatState('full')}
            >
              Ask AI
            </button>
          </div>
        </div>
      </div>

      {rambleOpen && (
        <RambleSheet
          onClose={() => setRambleOpen(false)}
          onTranscript={(text) => {
            setRambleOpen(false)
            setChatState('full')
            setInjection({ text, nonce: Date.now() })
          }}
        />
      )}

      <ChatSheet
        bundle={bundle}
        tab={tab}
        state={chatState}
        onStateChange={setChatState}
        onChangeTab={setTab}
        onApplied={() => setAiStatus(`Changes applied · ${stamp()}`)}
        injection={injection}
        onInjectionConsumed={() => setInjection(null)}
      />
    </main>
  )
}
