// Ramble surface per PLAN.md Phase-7: home-screen mic → MediaRecorder
// capture → STT → LLM → editable createDecision approval card. Transcripts
// are ephemeral like chat. getUserMedia is secure-contexts-only, so plain
// HTTP shows an explanation instead of a dead button.

import { useEffect, useRef, useState } from 'react'
import { applyDecisionSkeleton } from '../ai/apply'
import { rambleSystemPrompt } from '../ai/context'
import { formatPlaceReply } from '../ai/formatPlaceReply'
import { chat, ProviderError, type ChatMessage } from '../ai/providers'
import { parseReply, ProposalParseError } from '../ai/proposals'
import { isConfigured, loadSettings, saveSettings } from '../ai/settings'
import { supportsStt, transcribe } from '../ai/stt'
import { speak, stopSpeaking, unlockSpeech } from '../ai/tts'
import { queryDecision } from '../queries'
import type { DecisionSkeletonInput } from '../types'
import AiSettingsPanel from './AiSettingsPanel'
import SkeletonCard, { type SkeletonOutcome } from './SkeletonCard'
import { entryTab, type Tab } from './tabs'

type Phase = 'idle' | 'recording' | 'transcribing' | 'thinking'

type Entry =
  | { id: number; kind: 'transcript' | 'user' | 'assistant' | 'error'; text: string }
  | { id: number; kind: 'card'; skeleton: DecisionSkeletonInput; rev: number; outcome?: SkeletonOutcome }

let entrySeq = 0

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never
type NewEntry = DistributiveOmit<Entry, 'id'>

// Safari records AAC in an mp4 container; Chrome/Firefox record webm.
// Probe what this engine can actually produce, in preference order.
const MIME_CANDIDATES = ['audio/webm', 'audio/mp4', 'audio/aac', 'audio/ogg;codecs=opus']

export function pickRecordingMimeType(): string | undefined {
  if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') {
    return undefined
  }
  return MIME_CANDIDATES.find((t) => MediaRecorder.isTypeSupported(t))
}

/** getUserMedia and MediaRecorder both need a secure context (or polyfills). */
export function micUnavailable(): boolean {
  return !(
    typeof navigator !== 'undefined' &&
    navigator.mediaDevices &&
    typeof navigator.mediaDevices.getUserMedia === 'function' &&
    typeof MediaRecorder !== 'undefined'
  )
}

const formatElapsed = (s: number) =>
  `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

export default function RambleSheet({
  onClose,
  onCreated,
  onTranscript,
  initialText,
}: {
  onClose: () => void
  /** Home mode: filling in a skeleton opens the new decision. */
  onCreated?: (decisionId: string, tab: Tab) => void
  /** Decision mode: hand the transcript to that decision's chat and stop. */
  onTranscript?: (text: string) => void
  /** Home composer: typed content sent as the first message. */
  initialText?: string
}) {
  const [entries, setEntries] = useState<Entry[]>([])
  const [phase, setPhase] = useState<Phase>('idle')
  const [elapsed, setElapsed] = useState(0)
  const [input, setInput] = useState('')
  const [voice, setVoice] = useState(() => loadSettings().voiceReplies)
  // Mirror so a reply finishing mid-toggle re-checks the setting.
  const voiceRef = useRef(voice)
  voiceRef.current = voice
  const [view, setView] = useState<'ramble' | 'settings'>('ramble')
  const scrollRef = useRef<HTMLDivElement>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const cancelledRef = useRef(false)
  const timerRef = useRef<number | null>(null)
  const entriesRef = useRef(entries)
  entriesRef.current = entries
  const seededRef = useRef(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [entries, phase])

  // Unmounting the sheet must never leave the mic hot or a timer running.
  useEffect(
    () => () => {
      if (timerRef.current !== null) window.clearInterval(timerRef.current)
      const recorder = recorderRef.current
      if (recorder && recorder.state !== 'inactive') {
        cancelledRef.current = true
        recorder.stop()
      }
      stopSpeaking()
    },
    [],
  )

  // Same persisted setting as the chat sheet's toggle.
  const toggleVoice = () => {
    const next = !voice
    setVoice(next)
    saveSettings({ ...loadSettings(), voiceReplies: next })
    if (!next) stopSpeaking()
    else unlockSpeech()
  }

  const pushEntry = (entry: NewEntry) =>
    setEntries((prev) => [...prev, { ...entry, id: ++entrySeq } as Entry])

  const settings = loadSettings()
  const configured = isConfigured(settings)
  const hasStt = configured && supportsStt(settings)
  const noMic = micUnavailable()

  const ask = async (text: string, kind: 'transcript' | 'user') => {
    if (onTranscript) {
      pushEntry({ kind: 'transcript', text })
      onTranscript(text)
      setPhase('idle')
      return
    }
    pushEntry({ kind, text })
    setPhase('thinking')
    const draft = [...entriesRef.current].reverse().find((e) => e.kind === 'card')
    const content =
      draft && draft.kind === 'card'
        ? `Current proposed decision (JSON):\n${JSON.stringify(draft.skeleton)}\n\n${text}`
        : kind === 'transcript'
          ? `Voice ramble transcript:\n${text}`
          : text
    const history: ChatMessage[] = []
    for (const e of entriesRef.current) {
      if (e.kind === 'user' || e.kind === 'transcript') history.push({ role: 'user', content: e.text })
      else if (e.kind === 'assistant') history.push({ role: 'assistant', content: e.text })
    }
    try {
      const ai = loadSettings()
      const reply = await chat(
        [{ role: 'system', content: rambleSystemPrompt(ai.webLookup) }, ...history, { role: 'user', content }],
        ai,
      )
      const parsed = parseReply(reply)
      const displayMessage = (raw: string) => formatPlaceReply(raw.trim())
      const only = parsed.proposals.length === 1 ? parsed.proposals[0] : null
      const spokenText =
        parsed.proposals.length === 0
          ? displayMessage(parsed.message || reply)
          : only && only.type === 'createDecision'
            ? displayMessage(parsed.message ?? '')
            : ''
      if (only && only.type === 'createDecision') {
        setEntries((prev) => {
          const next = [...prev]
          if (parsed.message) next.push({ id: ++entrySeq, kind: 'assistant', text: displayMessage(parsed.message) })
          const existing = next.findIndex((e) => e.kind === 'card' && !e.outcome)
          if (existing >= 0) {
            const card = next[existing]
            if (card.kind === 'card') {
              next[existing] = { ...card, skeleton: only.decision, rev: card.rev + 1 }
            }
          } else {
            next.push({ id: ++entrySeq, kind: 'card', skeleton: only.decision, rev: 0 })
          }
          return next
        })
      } else if (parsed.proposals.length === 0) {
        pushEntry({ kind: 'assistant', text: displayMessage(parsed.message || reply) })
      } else {
        pushEntry({
          kind: 'error',
          text: "The AI suggested changes that don't fit creating one new decision — try rambling again.",
        })
      }
      if (voiceRef.current && spokenText) void speak(spokenText, loadSettings())
    } catch (e) {
      const message =
        e instanceof ProposalParseError
          ? `Couldn't read the suggested decision: ${e.message}`
          : e instanceof ProviderError
            ? e.message
            : String(e)
      pushEntry({ kind: 'error', text: message })
    } finally {
      setPhase('idle')
      setElapsed(0)
    }
  }

  useEffect(() => {
    if (onTranscript || !initialText?.trim() || seededRef.current) return
    if (!isConfigured(loadSettings())) return
    seededRef.current = true
    void ask(initialText.trim(), 'user')
    // Seed once when AI is ready (including after returning from settings).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialText, onTranscript, view, configured])

  const handleRamble = async (audio: Blob, mimeType: string) => {
    setPhase('transcribing')
    try {
      const text = await transcribe(audio, mimeType, loadSettings())
      await ask(text, 'transcript')
    } catch (e) {
      const message =
        e instanceof ProposalParseError
          ? `Couldn't read the suggested decision: ${e.message}`
          : e instanceof ProviderError
            ? e.message
            : String(e)
      pushEntry({ kind: 'error', text: message })
      setPhase('idle')
      setElapsed(0)
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
          setPhase('idle')
          setElapsed(0)
          return
        }
        const type = recorder.mimeType || mimeType || 'audio/webm'
        const blob = new Blob(chunksRef.current, { type })
        if (blob.size === 0) {
          pushEntry({ kind: 'error', text: 'Nothing was recorded — try again and speak up.' })
          setPhase('idle')
          return
        }
        void handleRamble(blob, type)
      }
      recorder.start()
      recorderRef.current = recorder
      setElapsed(0)
      setPhase('recording')
      timerRef.current = window.setInterval(() => setElapsed((s) => s + 1), 1000)
    } catch (e) {
      const message =
        e instanceof DOMException && e.name === 'NotAllowedError'
          ? 'Microphone permission was denied — allow the mic for this site and try again.'
          : `Could not start the microphone: ${e instanceof Error ? e.message : String(e)}`
      pushEntry({ kind: 'error', text: message })
    }
  }

  const stopRecording = () => {
    if (voiceRef.current) unlockSpeech()
    recorderRef.current?.stop()
  }
  const cancelRecording = () => {
    cancelledRef.current = true
    recorderRef.current?.stop()
  }

  const approve = async (cardId: number, skeleton: DecisionSkeletonInput) => {
    try {
      const decision = await applyDecisionSkeleton(skeleton)
      const bundle = await queryDecision(decision.id)
      onCreated?.(
        decision.id,
        bundle ? entryTab(bundle.dimensions, bundle.options, bundle.scores) : 'dimensions',
      )
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      setEntries((prev) =>
        prev.map((entry) =>
          entry.kind === 'card' && entry.id === cardId ? { ...entry, outcome: { error: message } } : entry,
        ),
      )
    }
  }

  const sendTyped = () => {
    const text = input.trim()
    if (!text || phase !== 'idle') return
    if (voiceRef.current) unlockSpeech()
    setInput('')
    void ask(text, 'user')
  }

  if (view === 'settings') {
    return (
      <div className="fixed inset-0 z-40 flex flex-col bg-bg">
        <div className="px-4" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 0.5rem)' }}>
          <button
            type="button"
            className="min-h-11 text-sm text-ink-3 hover:text-ink-2"
            onClick={() => setView('ramble')}
          >
            ← Back to ramble
          </button>
        </div>
        <AiSettingsPanel onDone={() => setView('ramble')} />
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-bg">
      <div
        className="relative flex items-center gap-2 border-b border-hairline px-4 pb-2"
        style={{ paddingTop: 'calc(env(safe-area-inset-top) + 0.75rem)' }}
      >
        <span className="flex-1 text-center text-sm font-semibold text-ink">Ramble</span>
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
          onClick={onClose}
        >
          ✕
        </button>
      </div>

      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
        {!configured && entries.length === 0 && (
          <div className="mt-8 rounded-xl border border-hairline bg-surface p-4 text-center">
            <p className="text-sm text-ink-2">
              Ramble what you're choosing — typed or out loud — and the AI fills in what it can. Set
              up AI first.
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
        {configured && !hasStt && (
          <div className="mt-8 rounded-xl border border-hairline bg-surface p-4 text-center">
            <p className="text-sm text-ink-2">
              Voice needs a provider with speech-to-text — OpenAI, Gemini or a custom endpoint.
              The current provider has none, so the mic is greyed out.
            </p>
            <button
              type="button"
              className="mt-3 min-h-11 rounded-xl bg-accent px-4 text-sm font-semibold text-on-accent"
              onClick={() => setView('settings')}
            >
              Change provider
            </button>
          </div>
        )}
        {hasStt && noMic && (
          <div className="mt-8 rounded-xl border border-hairline bg-surface p-4 text-center">
            <p className="text-sm text-ink-2">
              The microphone needs a secure page (HTTPS or localhost), and this one isn't — open
              the https link instead.
            </p>
          </div>
        )}
        {entries.map((entry) =>
          entry.kind === 'card' ? (
            <SkeletonCard
              key={`${entry.id}-${entry.rev}`}
              initial={entry.skeleton}
              outcome={entry.outcome}
              onApply={(skeleton) => void approve(entry.id, skeleton)}
              onKeepChatting={() => inputRef.current?.focus()}
              onChange={(skeleton) =>
                setEntries((prev) =>
                  prev.map((e) =>
                    e.kind === 'card' && e.id === entry.id ? { ...e, skeleton } : e,
                  ),
                )
              }
            />
          ) : (
            <div
              key={entry.id}
              className={
                entry.kind === 'transcript' || entry.kind === 'user'
                  ? 'ml-8 rounded-xl bg-accent px-3 py-2 text-sm text-on-accent'
                  : entry.kind === 'error'
                    ? 'rounded-xl border border-red-400/30 bg-red-400/10 px-3 py-2 text-sm text-red-300'
                    : 'mr-8 rounded-xl bg-surface px-3 py-2 text-sm text-ink-2'
              }
            >
              {entry.kind === 'transcript' && (
                <span className="mr-1 font-mono text-[10px] uppercase tracking-[0.1em] opacity-70">
                  You said
                </span>
              )}
              {entry.kind === 'user' && (
                <span className="mr-1 font-mono text-[10px] uppercase tracking-[0.1em] opacity-70">
                  You
                </span>
              )}
              {entry.text}
            </div>
          ),
        )}
        {phase === 'transcribing' && (
          <div className="mr-8 animate-pulse rounded-xl bg-surface px-3 py-2 text-sm text-ink-3">
            Transcribing…
          </div>
        )}
        {phase === 'thinking' && (
          <div className="mr-8 animate-pulse rounded-xl bg-surface px-3 py-2 text-sm text-ink-3">
            {loadSettings().webLookup ? 'Looking up…' : 'Thinking…'}
          </div>
        )}
      </div>

      <div
        className="border-t border-hairline bg-menu px-4 pt-3"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 0.75rem)' }}
      >
        {phase === 'recording' ? (
          <div className="flex items-center justify-center gap-4">
            <button
              type="button"
              className="min-h-11 rounded-md px-3 text-sm font-medium text-ink-3 hover:bg-hover"
              onClick={cancelRecording}
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
              onClick={stopRecording}
            >
              Stop
            </button>
          </div>
        ) : (
          <form
            className="flex items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              sendTyped()
            }}
          >
            <button
              type="button"
              disabled={!hasStt || noMic || phase !== 'idle'}
              aria-label="Record a ramble"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-hairline bg-surface-2 disabled:opacity-40"
              onClick={() => void startRecording()}
            >
              <span className="size-1.5 rounded-full bg-accent" />
            </button>
            <input
              ref={inputRef}
              className="min-w-0 flex-1 rounded-xl border border-hairline bg-surface-2 px-3 py-2.5 text-base text-ink placeholder:text-ink-4 focus:border-accent focus:outline-none"
              placeholder={
                onTranscript
                  ? 'Write or speak about this decision…'
                  : 'Write or speak what you are choosing…'
              }
              value={input}
              onChange={(e) => setInput(e.target.value)}
            />
            <button
              type="submit"
              disabled={phase !== 'idle' || input.trim() === ''}
              className="min-h-11 rounded-xl bg-accent px-4 text-sm font-semibold text-on-accent disabled:opacity-40"
            >
              Send
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
