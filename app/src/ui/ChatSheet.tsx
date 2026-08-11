// Chat surface per PLAN.md Phase-6: full-screen bottom sheet, one entry
// point, context implicit from the active tab (tappable chip), transcripts
// ephemeral (in-memory only — leaving the decision resets them).

import { useEffect, useRef, useState } from 'react'
import { applyProposals, type ApplyOutcome } from '../ai/apply'
import { decisionSnapshot, systemPrompt } from '../ai/context'
import { chat, ProviderError } from '../ai/providers'
import { parseReply, ProposalParseError, type Proposal } from '../ai/proposals'
import { isConfigured, loadSettings } from '../ai/settings'
import type { DecisionBundle } from '../queries'
import AiSettingsPanel from './AiSettingsPanel'
import ApprovalCard from './ApprovalCard'
import { TABS, type Tab } from './tabs'

export type ChatState = 'closed' | 'peek' | 'full'

type Entry =
  | { id: number; kind: 'user' | 'assistant' | 'error'; text: string }
  | { id: number; kind: 'card'; proposals: Proposal[]; outcomes?: ApplyOutcome[] }

let entrySeq = 0

export default function ChatSheet({
  bundle,
  tab,
  state,
  onStateChange,
  onCycleTab,
}: {
  bundle: DecisionBundle
  tab: Tab
  state: ChatState
  onStateChange: (s: ChatState) => void
  onCycleTab: () => void
}) {
  const [entries, setEntries] = useState<Entry[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [view, setView] = useState<'chat' | 'settings'>('chat')
  const scrollRef = useRef<HTMLDivElement>(null)
  // The tab the user was on when they sent each message is what counts; the
  // chip only affects messages sent after switching.
  const tabRef = useRef(tab)
  tabRef.current = tab

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [entries, busy, state])

  if (state === 'closed') return null

  if (state === 'peek') {
    return (
      <button
        type="button"
        className="fixed inset-x-0 bottom-0 z-40 rounded-t-2xl border-t border-slate-200 bg-white px-4 pt-2 shadow-lg"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 0.75rem)' }}
        onClick={() => onStateChange('full')}
      >
        <div className="mx-auto h-1 w-10 rounded-full bg-slate-300" />
        <p className="mt-2 text-center text-sm font-medium text-slate-700">
          Ask AI — changes applied · tap to continue
        </p>
      </button>
    )
  }

  const configured = isConfigured(loadSettings())

  const send = async () => {
    const text = input.trim()
    if (!text || busy) return
    if (!configured) {
      setView('settings')
      return
    }
    setInput('')
    const history = entries.flatMap((e) =>
      e.kind === 'user' || e.kind === 'assistant' ? [{ role: e.kind, content: e.text }] : [],
    )
    setEntries((prev) => [...prev, { id: ++entrySeq, kind: 'user', text }])
    setBusy(true)
    try {
      const reply = await chat(
        [
          { role: 'system', content: systemPrompt(tabRef.current) },
          ...history,
          {
            role: 'user',
            content: `Decision snapshot (JSON):\n${decisionSnapshot(bundle)}\n\n${text}`,
          },
        ],
        loadSettings(),
      )
      const parsed = parseReply(reply)
      setEntries((prev) => {
        const next = [...prev]
        if (parsed.message) next.push({ id: ++entrySeq, kind: 'assistant', text: parsed.message })
        if (parsed.proposals.length > 0) {
          next.push({ id: ++entrySeq, kind: 'card', proposals: parsed.proposals })
        } else if (!parsed.message && reply.trim()) {
          next.push({ id: ++entrySeq, kind: 'assistant', text: reply.trim() })
        }
        return next
      })
    } catch (e) {
      const message =
        e instanceof ProposalParseError
          ? `Couldn't read the suggested changes: ${e.message}`
          : e instanceof ProviderError
            ? e.message
            : String(e)
      setEntries((prev) => [...prev, { id: ++entrySeq, kind: 'error', text: message }])
    } finally {
      setBusy(false)
    }
  }

  const apply = async (cardId: number, proposals: Proposal[]) => {
    const outcomes = await applyProposals(bundle.decision.id, proposals)
    setEntries((prev) =>
      prev.map((e) => (e.kind === 'card' && e.id === cardId ? { ...e, outcomes } : e)),
    )
    onStateChange('peek')
  }

  const reject = (cardId: number) => {
    setEntries((prev) =>
      prev.map((e) => (e.kind === 'card' && e.id === cardId ? { ...e, outcomes: [] } : e)),
    )
  }

  if (view === 'settings') {
    return (
      <div className="fixed inset-0 z-40 flex flex-col bg-slate-50">
        <div className="px-4" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 0.5rem)' }}>
          <button
            type="button"
            className="text-sm text-slate-500 hover:text-slate-800"
            onClick={() => setView('chat')}
          >
            ← Back to chat
          </button>
        </div>
        <AiSettingsPanel onDone={() => setView('chat')} />
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-slate-50">
      <div
        className="relative flex items-center gap-2 border-b border-slate-200 bg-white px-4 pb-2"
        style={{ paddingTop: 'calc(env(safe-area-inset-top) + 0.75rem)' }}
      >
        <div className="absolute left-1/2 top-1 h-1 w-10 -translate-x-1/2 rounded-full bg-slate-300" />
        <button
          type="button"
          className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600"
          onClick={onCycleTab}
          title="Tap to switch what the AI is looking at"
        >
          {TABS.find((t) => t.id === tab)?.label} ▾
        </button>
        <span className="flex-1 text-center text-sm font-semibold text-slate-700">Ask AI</span>
        <button
          type="button"
          className="rounded-md px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100"
          onClick={() => setView('settings')}
        >
          Settings
        </button>
        <button
          type="button"
          aria-label="Close"
          className="h-8 w-8 rounded-md text-slate-500 hover:bg-slate-100"
          onClick={() => onStateChange('closed')}
        >
          ✕
        </button>
      </div>

      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
        {!configured && entries.length === 0 && (
          <div className="mt-8 rounded-xl bg-white p-4 text-center shadow-sm">
            <p className="text-sm text-slate-600">
              Ask about dimensions, options, scores or results — but set up AI first.
            </p>
            <button
              type="button"
              className="mt-3 rounded-md bg-sky-500 px-4 py-2 text-sm font-medium text-white hover:bg-sky-600"
              onClick={() => setView('settings')}
            >
              Set up AI
            </button>
          </div>
        )}
        {entries.map((entry) =>
          entry.kind === 'card' ? (
            <ApprovalCard
              key={entry.id}
              bundle={bundle}
              initial={entry.proposals}
              outcomes={entry.outcomes}
              onApply={(proposals) => void apply(entry.id, proposals)}
              onReject={() => reject(entry.id)}
            />
          ) : (
            <div
              key={entry.id}
              className={
                entry.kind === 'user'
                  ? 'ml-8 rounded-xl bg-sky-500 px-3 py-2 text-sm text-white'
                  : entry.kind === 'error'
                    ? 'rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700'
                    : 'mr-8 rounded-xl bg-white px-3 py-2 text-sm text-slate-800 shadow-sm'
              }
            >
              {entry.text}
            </div>
          ),
        )}
        {busy && (
          <div className="mr-8 animate-pulse rounded-xl bg-white px-3 py-2 text-sm text-slate-400 shadow-sm">
            Thinking…
          </div>
        )}
      </div>

      <form
        className="flex gap-2 border-t border-slate-200 bg-white px-4 pt-2"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 0.5rem)' }}
        onSubmit={(e) => {
          e.preventDefault()
          void send()
        }}
      >
        <input
          className="flex-1 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:border-sky-500 focus:outline-none"
          placeholder={configured ? 'Ask about this decision…' : 'Set up AI first…'}
          value={input}
          onChange={(e) => setInput(e.target.value)}
        />
        <button
          type="submit"
          disabled={busy || input.trim() === ''}
          className="rounded-md bg-sky-500 px-4 text-sm font-semibold text-white enabled:hover:bg-sky-600 disabled:opacity-40"
        >
          Send
        </button>
      </form>
    </div>
  )
}
