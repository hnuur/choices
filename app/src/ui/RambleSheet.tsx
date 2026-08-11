// Ramble surface per PLAN.md Phase-7: home-screen mic → MediaRecorder
// capture → STT → LLM → editable createDecision approval card. Transcripts
// are ephemeral like chat. getUserMedia is secure-contexts-only, so plain
// HTTP shows an explanation instead of a dead button.

import { useEffect, useRef, useState } from 'react'
import { applyDecisionSkeleton } from '../ai/apply'
import { rambleSystemPrompt } from '../ai/context'
import { chat, ProviderError } from '../ai/providers'
import { parseReply, ProposalParseError } from '../ai/proposals'
import { isConfigured, loadSettings } from '../ai/settings'
import { supportsStt, transcribe } from '../ai/stt'
import type { DecisionSkeletonInput } from '../types'
import AiSettingsPanel from './AiSettingsPanel'
import SkeletonCard, { type SkeletonOutcome } from './SkeletonCard'

type Phase = 'idle' | 'recording' | 'transcribing' | 'thinking'

type Entry =
  | { id: number; kind: 'transcript' | 'assistant' | 'error'; text: string }
  | { id: number; kind: 'card'; skeleton: DecisionSkeletonInput; outcome?: SkeletonOutcome }

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
}: {
  onClose: () => void
  onCreated: (decisionId: string) => void
}) {
  const [entries, setEntries] = useState<Entry[]>([])
  const [phase, setPhase] = useState<Phase>('idle')
  const [elapsed, setElapsed] = useState(0)
  const [view, setView] = useState<'ramble' | 'settings'>('ramble')
  const scrollRef = useRef<HTMLDivElement>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const cancelledRef = useRef(false)
  const timerRef = useRef<number | null>(null)

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
    },
    [],
  )

  const pushEntry = (entry: NewEntry) =>
    setEntries((prev) => [...prev, { ...entry, id: ++entrySeq } as Entry])

  const settings = loadSettings()
  const configured = isConfigured(settings)
  const hasStt = configured && supportsStt(settings)
  const noMic = micUnavailable()

  const handleRamble = async (audio: Blob, mimeType: string) => {
    setPhase('transcribing')
    try {
      const text = await transcribe(audio, mimeType, loadSettings())
      pushEntry({ kind: 'transcript', text })
      setPhase('thinking')
      const reply = await chat(
        [
          { role: 'system', content: rambleSystemPrompt() },
          { role: 'user', content: `Voice ramble transcript:\n${text}` },
        ],
        loadSettings(),
      )
      const parsed = parseReply(reply)
      const only = parsed.proposals.length === 1 ? parsed.proposals[0] : null
      if (only && only.type === 'createDecision') {
        if (parsed.message) pushEntry({ kind: 'assistant', text: parsed.message })
        pushEntry({ kind: 'card', skeleton: only.decision })
      } else if (parsed.proposals.length === 0) {
        pushEntry({ kind: 'assistant', text: parsed.message || reply.trim() })
      } else {
        pushEntry({
          kind: 'error',
          text: "The AI suggested changes that don't fit creating one new decision — try rambling again.",
        })
      }
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

  const stopRecording = () => recorderRef.current?.stop()
  const cancelRecording = () => {
    cancelledRef.current = true
    recorderRef.current?.stop()
  }

  const approve = async (cardId: number, skeleton: DecisionSkeletonInput) => {
    try {
      const decision = await applyDecisionSkeleton(skeleton)
      onCreated(decision.id)
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      setEntries((prev) =>
        prev.map((entry) =>
          entry.kind === 'card' && entry.id === cardId ? { ...entry, outcome: { error: message } } : entry,
        ),
      )
    }
  }

  const reject = (cardId: number) => {
    setEntries((prev) =>
      prev.map((entry) =>
        entry.kind === 'card' && entry.id === cardId ? { ...entry, outcome: 'rejected' as const } : entry,
      ),
    )
  }

  if (view === 'settings') {
    return (
      <div className="fixed inset-0 z-40 flex flex-col bg-slate-50">
        <div className="px-4" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 0.5rem)' }}>
          <button
            type="button"
            className="text-sm text-slate-500 hover:text-slate-800"
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
    <div className="fixed inset-0 z-40 flex flex-col bg-slate-50">
      <div
        className="relative flex items-center gap-2 border-b border-slate-200 bg-white px-4 pb-2"
        style={{ paddingTop: 'calc(env(safe-area-inset-top) + 0.75rem)' }}
      >
        <div className="absolute left-1/2 top-1 h-1 w-10 -translate-x-1/2 rounded-full bg-slate-300" />
        <span className="flex-1 text-center text-sm font-semibold text-slate-700">Ramble</span>
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
          onClick={onClose}
        >
          ✕
        </button>
      </div>

      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
        {!configured && entries.length === 0 && (
          <div className="mt-8 rounded-xl bg-white p-4 text-center shadow-sm">
            <p className="text-sm text-slate-600">
              Ramble what you're choosing out loud — the AI builds the decision skeleton. Set up
              AI first.
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
        {configured && !hasStt && (
          <div className="mt-8 rounded-xl bg-white p-4 text-center shadow-sm">
            <p className="text-sm text-slate-600">
              Voice needs a provider with speech-to-text — OpenAI, Gemini or a custom endpoint.
              The current provider has none, so the mic is greyed out.
            </p>
            <button
              type="button"
              className="mt-3 rounded-md bg-sky-500 px-4 py-2 text-sm font-medium text-white hover:bg-sky-600"
              onClick={() => setView('settings')}
            >
              Change provider
            </button>
          </div>
        )}
        {hasStt && noMic && (
          <div className="mt-8 rounded-xl bg-white p-4 text-center shadow-sm">
            <p className="text-sm text-slate-600">
              The microphone needs a secure page (HTTPS or localhost), and this one isn't — open
              the https link instead.
            </p>
          </div>
        )}
        {entries.map((entry) =>
          entry.kind === 'card' ? (
            <SkeletonCard
              key={entry.id}
              initial={entry.skeleton}
              outcome={entry.outcome}
              onApply={(skeleton) => void approve(entry.id, skeleton)}
              onReject={() => reject(entry.id)}
            />
          ) : (
            <div
              key={entry.id}
              className={
                entry.kind === 'transcript'
                  ? 'ml-8 rounded-xl bg-sky-500 px-3 py-2 text-sm text-white'
                  : entry.kind === 'error'
                    ? 'rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700'
                    : 'mr-8 rounded-xl bg-white px-3 py-2 text-sm text-slate-800 shadow-sm'
              }
            >
              {entry.kind === 'transcript' && (
                <span className="mr-1 text-xs uppercase tracking-wide opacity-70">You said</span>
              )}
              {entry.text}
            </div>
          ),
        )}
        {phase === 'transcribing' && (
          <div className="mr-8 animate-pulse rounded-xl bg-white px-3 py-2 text-sm text-slate-400 shadow-sm">
            Transcribing…
          </div>
        )}
        {phase === 'thinking' && (
          <div className="mr-8 animate-pulse rounded-xl bg-white px-3 py-2 text-sm text-slate-400 shadow-sm">
            Thinking…
          </div>
        )}
      </div>

      <div
        className="border-t border-slate-200 bg-white px-4 pt-3"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 0.75rem)' }}
      >
        {phase === 'recording' ? (
          <div className="flex items-center justify-center gap-4">
            <button
              type="button"
              className="min-h-11 rounded-md px-3 text-sm font-medium text-slate-500 hover:bg-slate-100"
              onClick={cancelRecording}
            >
              Cancel
            </button>
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 animate-pulse rounded-full bg-red-500" />
              <span className="text-sm font-medium text-slate-700">{formatElapsed(elapsed)}</span>
            </div>
            <button
              type="button"
              className="min-h-11 rounded-md bg-sky-500 px-6 py-3 text-sm font-semibold text-white hover:bg-sky-600"
              onClick={stopRecording}
            >
              Stop
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-1.5">
            <button
              type="button"
              disabled={!hasStt || noMic || phase !== 'idle'}
              aria-label="Record a ramble"
              className="flex h-16 w-16 items-center justify-center rounded-full bg-sky-500 text-2xl text-white enabled:hover:bg-sky-600 disabled:opacity-40"
              onClick={() => void startRecording()}
            >
              🎤
            </button>
            <p className="text-xs text-slate-500">
              {hasStt && !noMic
                ? 'Tap, ramble what you are choosing, tap Stop.'
                : noMic
                  ? 'Mic unavailable on this page.'
                  : 'Mic greyed out — no speech-to-text here.'}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
