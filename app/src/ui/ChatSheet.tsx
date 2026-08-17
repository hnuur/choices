// Chat surface per PLAN.md Phase-6: full-screen bottom sheet, one entry
// point, context implicit from the active tab (tappable chip), transcripts
// ephemeral (in-memory only — leaving the decision resets them).
// Phase-8: the decision view's fixed bottom bar is the peek surface — after
// approve the sheet drops to the bar, which carries the status line.

import { useEffect, useRef, useState } from 'react'
import { applyProposals, type ApplyOutcome } from '../ai/apply'
import { decisionSnapshot, systemPrompt } from '../ai/context'
import { formatPlaceReply } from '../ai/formatPlaceReply'
import { chat, ProviderError } from '../ai/providers'
import { parseReply, ProposalParseError, type Proposal } from '../ai/proposals'
import { isConfigured, loadSettings, saveSettings } from '../ai/settings'
import { supportsStt, transcribe } from '../ai/stt'
import { speak, stopSpeaking, unlockSpeech } from '../ai/tts'
import type { DecisionBundle } from '../queries'
import AiSettingsPanel from './AiSettingsPanel'
import ApprovalCard from './ApprovalCard'
import { micUnavailable, pickRecordingMimeType } from './RambleSheet'
import { TABS, type Tab } from './tabs'

const formatElapsed = (s: number) =>
  `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

export type ChatState = 'closed' | 'peek' | 'full'

type Entry =
  | { id: number; kind: 'user' | 'assistant' | 'error'; text: string }
  | {
      id: number
      kind: 'card'
      proposals: Proposal[]
      outcomes?: ApplyOutcome[]
      resolved?: 'applied' | 'rejected'
    }

let entrySeq = 0

export default function ChatSheet({
  bundle,
  tab,
  state,
  onStateChange,
  onCycleTab,
  onApplied,
  injection,
  onInjectionConsumed,
}: {
  bundle: DecisionBundle
  tab: Tab
  state: ChatState
  onStateChange: (s: ChatState) => void
  onCycleTab: () => void
  onApplied?: () => void
  /** Ramble-everywhere: a transcript to enter as if typed (nonce re-triggers). */
  injection?: { text: string; nonce: number } | null
  onInjectionConsumed: () => void
}) {
  const [entries, setEntries] = useState<Entry[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [voice, setVoice] = useState(() => loadSettings().voiceReplies)
  // Mirror so an in-flight reply re-checks the toggle after its await.
  const voiceRef = useRef(voice)
  voiceRef.current = voice
  const [view, setView] = useState<'chat' | 'settings'>('chat')
  const scrollRef = useRef<HTMLDivElement>(null)
  // The tab the user was on when they sent each message is what counts; the
  // chip only affects messages sent after switching.
  const tabRef = useRef(tab)
  tabRef.current = tab
  const [rec, setRec] = useState<'idle' | 'recording' | 'transcribing'>('idle')
  const [elapsed, setElapsed] = useState(0)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const cancelledRef = useRef(false)
  const timerRef = useRef<number | null>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [entries, busy, state])

  // Spoken replies stop when the sheet drops or unmounts.
  const stopRecorder = () => {
    if (timerRef.current !== null) window.clearInterval(timerRef.current)
    timerRef.current = null
    const recorder = recorderRef.current
    if (recorder && recorder.state !== 'inactive') {
      cancelledRef.current = true
      recorder.stop()
    }
  }

  useEffect(() => {
    if (state !== 'full') {
      stopSpeaking()
      stopRecorder()
    }
  }, [state])
  useEffect(
    () => () => {
      stopRecorder()
      stopSpeaking()
    },
    [],
  )

  // The ramble sheet can flip the shared toggle while this sheet stays
  // mounted — re-read the setting every time the chat opens.
  useEffect(() => {
    if (state === 'full') setVoice(loadSettings().voiceReplies)
  }, [state])

  // Ramble-everywhere: a transcript handed over from the decision view's mic
  // enters the chat exactly as if typed (proposals, approval card, all of it).
  useEffect(() => {
    if (!injection || busy) return
    onInjectionConsumed()
    void send(injection.text)
    // send reads entries/busy from the render scope; the deps cover the trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [injection, busy])

  if (state !== 'full') return null

  const configured = isConfigured(loadSettings())

  const toggleVoice = () => {
    const next = !voice
    setVoice(next)
    saveSettings({ ...loadSettings(), voiceReplies: next })
    if (!next) stopSpeaking()
    else unlockSpeech()
  }

  const send = async (raw?: string) => {
    const text = (raw ?? input).trim()
    if (!text || busy) return
    if (!configured) {
      setView('settings')
      return
    }
    if (voiceRef.current) unlockSpeech()
    if (raw === undefined) setInput('')
    // Prior turns are forwarded so the assistant keeps context; resolved
    // approval cards join as an assistant turn so it knows what landed.
    const history = entries.flatMap((e) => {
      if (e.kind === 'user' || e.kind === 'assistant') return [{ role: e.kind, content: e.text }]
      if (e.kind === 'card' && e.resolved) {
        return [
          {
            role: 'assistant' as const,
            content: `I proposed: ${e.proposals.map((p) => p.type).join(', ')}. The user ${e.resolved} them.`,
          },
        ]
      }
      return []
    })
    setEntries((prev) => [...prev, { id: ++entrySeq, kind: 'user', text }])
    setBusy(true)
    try {
      const ai = loadSettings()
      const reply = await chat(
        [
          { role: 'system', content: systemPrompt(tabRef.current, ai.webLookup) },
          ...history,
          {
            role: 'user',
            content: `Decision snapshot (JSON):\n${decisionSnapshot(bundle)}\n\n${text}`,
          },
        ],
        ai,
      )
      const parsed = parseReply(reply)
      const displayMessage = (raw: string) => formatPlaceReply(raw.trim())
      const spokenText =
        parsed.message || (parsed.proposals.length === 0 ? displayMessage(reply) : '')
      setEntries((prev) => {
        const next = [...prev]
        if (parsed.message) next.push({ id: ++entrySeq, kind: 'assistant', text: displayMessage(parsed.message) })
        if (parsed.proposals.length > 0) {
          next.push({ id: ++entrySeq, kind: 'card', proposals: parsed.proposals })
        } else if (!parsed.message && reply.trim()) {
          next.push({ id: ++entrySeq, kind: 'assistant', text: displayMessage(reply) })
        }
        return next
      })
      if (voiceRef.current && spokenText) void speak(displayMessage(spokenText), loadSettings())
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

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mimeType = pickRecordingMimeType()
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
      chunksRef.current = []
      cancelledRef.current = false
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop())
        if (timerRef.current !== null) {
          window.clearInterval(timerRef.current)
          timerRef.current = null
        }
        if (cancelledRef.current) {
          setRec('idle')
          setElapsed(0)
          return
        }
        const type = recorder.mimeType || mimeType || 'audio/webm'
        const blob = new Blob(chunksRef.current, { type })
        if (blob.size === 0) {
          setEntries((prev) => [
            ...prev,
            { id: ++entrySeq, kind: 'error', text: 'Nothing was recorded — try again and speak up.' },
          ])
          setRec('idle')
          return
        }
        setRec('transcribing')
        void transcribe(blob, type, loadSettings())
          .then((text) => {
            setRec('idle')
            setElapsed(0)
            void send(text)
          })
          .catch((e) => {
            setEntries((prev) => [
              ...prev,
              { id: ++entrySeq, kind: 'error', text: e instanceof Error ? e.message : String(e) },
            ])
            setRec('idle')
            setElapsed(0)
          })
      }
      recorder.start()
      recorderRef.current = recorder
      setElapsed(0)
      setRec('recording')
      timerRef.current = window.setInterval(() => setElapsed((s) => s + 1), 1000)
    } catch (e) {
      const message =
        e instanceof DOMException && e.name === 'NotAllowedError'
          ? 'Microphone permission was denied — allow the mic for this site and try again.'
          : `Could not start the microphone: ${e instanceof Error ? e.message : String(e)}`
      setEntries((prev) => [...prev, { id: ++entrySeq, kind: 'error', text: message }])
    }
  }

  const apply = async (cardId: number, proposals: Proposal[]) => {
    const outcomes = await applyProposals(bundle.decision.id, proposals)
    setEntries((prev) =>
      prev.map((e) =>
        e.kind === 'card' && e.id === cardId ? { ...e, outcomes, resolved: 'applied' } : e,
      ),
    )
    onApplied?.()
    onStateChange('peek')
  }

  const reject = (cardId: number) => {
    setEntries((prev) =>
      prev.map((e) =>
        e.kind === 'card' && e.id === cardId ? { ...e, outcomes: [], resolved: 'rejected' } : e,
      ),
    )
  }

  if (view === 'settings') {
    return (
      <div className="fixed inset-0 z-40 flex flex-col bg-bg">
        <div className="px-4" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 0.5rem)' }}>
          <button
            type="button"
            className="min-h-11 text-sm text-ink-3 hover:text-ink-2"
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
    <div className="fixed inset-0 z-40 flex flex-col bg-bg">
      <div
        className="relative flex items-center gap-2 border-b border-hairline px-4 pb-2"
        style={{ paddingTop: 'calc(env(safe-area-inset-top) + 0.75rem)' }}
      >
        <button
          type="button"
          className="min-h-11 rounded-full bg-hover px-3 text-xs font-medium text-ink-2"
          onClick={onCycleTab}
          title="Tap to switch what the AI is looking at"
        >
          {TABS.find((t) => t.id === tab)?.label} ▾
        </button>
        <span className="flex-1 text-center text-sm font-semibold text-ink">Ask AI</span>
        <button
          type="button"
          className={`min-h-11 rounded-md px-2 font-mono text-[10px] uppercase tracking-[0.08em] ${
            voice ? 'text-accent-ink' : 'text-ink-4'
          }`}
          onClick={toggleVoice}
        >
          Voice {voice ? 'on' : 'off'}
        </button>
        <button
          type="button"
          className="min-h-11 rounded-md px-2 text-xs font-medium text-ink-3 hover:bg-hover"
          onClick={() => setView('settings')}
        >
          Settings
        </button>
        <button
          type="button"
          aria-label="Close"
          className="h-11 w-11 rounded-md text-ink-3 hover:bg-hover"
          onClick={() => onStateChange('closed')}
        >
          ✕
        </button>
      </div>

      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
        {!configured && entries.length === 0 && (
          <div className="mt-8 rounded-xl border border-hairline bg-surface p-4 text-center">
            <p className="text-sm text-ink-2">
              Ask about dimensions, options, scores or results — but set up AI first.
            </p>
            <button
              type="button"
              className="mt-3 min-h-11 rounded-xl bg-accent px-4 text-sm font-semibold text-on-accent"
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
                  ? 'ml-8 rounded-xl bg-accent px-3 py-2 text-sm text-on-accent'
                  : entry.kind === 'error'
                    ? 'rounded-xl border border-red-400/30 bg-red-400/10 px-3 py-2 text-sm text-red-300'
                    : 'mr-8 rounded-xl bg-surface px-3 py-2 text-sm text-ink-2'
              }
            >
              {entry.text}
            </div>
          ),
        )}
        {rec === 'transcribing' && (
          <div className="mr-8 animate-pulse rounded-xl bg-surface px-3 py-2 text-sm text-ink-3">
            Transcribing…
          </div>
        )}
        {busy && (
          <div className="mr-8 animate-pulse rounded-xl bg-surface px-3 py-2 text-sm text-ink-3">
            {loadSettings().webLookup ? 'Looking up…' : 'Thinking…'}
          </div>
        )}
      </div>

      {rec === 'recording' ? (
        <div
          className="flex items-center justify-center gap-4 border-t border-hairline bg-menu px-4 pt-3"
          style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 0.75rem)' }}
        >
          <button
            type="button"
            className="min-h-11 rounded-md px-3 text-sm font-medium text-ink-3 hover:bg-hover"
            onClick={() => {
              cancelledRef.current = true
              recorderRef.current?.stop()
            }}
          >
            Cancel
          </button>
          <div className="flex items-center gap-2">
            <span className="h-3 w-3 animate-pulse rounded-full bg-red-500" />
            <span className="font-mono text-sm font-medium text-ink-2">{formatElapsed(elapsed)}</span>
          </div>
          <button
            type="button"
            className="min-h-11 rounded-xl bg-accent px-6 text-sm font-semibold text-on-accent"
            onClick={() => {
              if (voiceRef.current) unlockSpeech()
              recorderRef.current?.stop()
            }}
          >
            Stop
          </button>
        </div>
      ) : (
        <form
          className="flex items-center gap-2 border-t border-hairline bg-menu px-4 pt-2"
          style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 0.5rem)' }}
          onSubmit={(e) => {
            e.preventDefault()
            void send()
          }}
        >
          <button
            type="button"
            disabled={!configured || !supportsStt(loadSettings()) || micUnavailable() || busy || rec !== 'idle'}
            aria-label="Record a ramble"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-hairline bg-surface-2 disabled:opacity-40"
            onClick={() => void startRecording()}
          >
            <span className="size-1.5 rounded-full bg-accent" />
          </button>
          <input
            className="min-w-0 flex-1 rounded-xl border border-hairline bg-surface-2 px-3 py-2.5 text-base text-ink placeholder:text-ink-4 focus:border-accent focus:outline-none"
            placeholder={configured ? 'Write or speak about this decision…' : 'Set up AI first…'}
            value={input}
            onChange={(e) => setInput(e.target.value)}
          />
          <button
            type="submit"
            disabled={busy || rec !== 'idle' || input.trim() === ''}
            className="min-h-11 rounded-xl bg-accent px-4 text-sm font-semibold text-on-accent enabled:hover:bg-accent-ink disabled:opacity-40"
          >
            Send
          </button>
        </form>
      )}
    </div>
  )
}
