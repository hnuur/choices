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
import { recordingUnavailableReason, transcribe } from '../ai/stt'
import { speak, stopSpeaking, unlockSpeech } from '../ai/tts'
import { voiceReviewCommand } from '../ai/voiceCapture'
import { pickRecordingMimeType, resolveRecordingMimeType } from '../ai/recordingMime'
import { queryDecision } from '../queries'
import type { DecisionSkeletonInput } from '../types'
import AiSettingsPanel from './AiSettingsPanel'
import ConversationMessage from './ConversationMessage'
import HandsFreeControls from './HandsFreeControls'
import SheetShell from './SheetShell'
import SkeletonCard, { type SkeletonOutcome } from './SkeletonCard'
import { entryTab, type Tab } from './tabs'
import { handsFreeUnavailableReason, useHandsFree } from './useHandsFree'

type Phase = 'idle' | 'recording' | 'transcribing' | 'thinking'

type Entry =
  | { id: number; kind: 'transcript' | 'user' | 'assistant' | 'error'; text: string }
  | { id: number; kind: 'card'; skeleton: DecisionSkeletonInput; rev: number; outcome?: SkeletonOutcome }

let entrySeq = 0

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never
type NewEntry = DistributiveOmit<Entry, 'id'>

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
  const [saving, setSaving] = useState(false)
  const applying = useRef(false)
  const reviewRef = useRef<(() => DecisionSkeletonInput | null) | null>(null)
  const voicedReview = useRef<string | null>(null)
  const [voice, setVoice] = useState(() => loadSettings().voiceReplies)
  // Mirror so a reply finishing mid-toggle re-checks the setting.
  const voiceRef = useRef(voice)
  voiceRef.current = voice
  const [view, setView] = useState<'ramble' | 'settings'>('ramble')
  const scrollRef = useRef<HTMLDivElement>(null)
  const pendingMic = useRef<AbortController | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const cancelledRef = useRef(false)
  const timerRef = useRef<number | null>(null)
  const entriesRef = useRef(entries)
  entriesRef.current = entries
  const seededRef = useRef(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const available = useRef(false)

  useEffect(() => {
    available.current = true
    return () => { available.current = false }
  }, [])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [entries, phase])

  // Unmounting the sheet must never leave the mic hot or a timer running.
  useEffect(
    () => () => {
      pendingMic.current?.abort()
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
  const recordingReason = configured ? recordingUnavailableReason(settings) : null
  const canRecord = configured && !recordingReason
  const handsFreeReason = handsFreeUnavailableReason(recordingReason, configured)
  const handsFree = useHandsFree(
    view === 'ramble' && !onTranscript && !handsFreeReason,
    (text, signal) => guidedTurn(text, signal),
    (signal) => startGuidance(signal),
  )

  const ask = async (text: string, kind: 'transcript' | 'user', signal?: AbortSignal) => {
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
      else if (e.kind === 'error') {
        history.push({
          role: 'assistant',
          content: `The app could not use my last reply (${e.text}). I will send a valid createDecision JSON block.`,
        })
      }
    }
    try {
      const ai = loadSettings()
      const reply = await chat(
        [{ role: 'system', content: rambleSystemPrompt(ai.webLookup, !!signal) }, ...history, { role: 'user', content }],
        ai,
        signal,
      )
      if (signal?.aborted || !available.current) return
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
      if (signal && only?.type === 'createDecision') {
        await readReview(only.decision, signal)
      } else if (spokenText && (signal || voiceRef.current)) {
        if (signal) await speak(spokenText, loadSettings(), signal)
        else void speak(spokenText, loadSettings())
      }
    } catch (e) {
      if (signal?.aborted || !available.current) return
      const message =
        e instanceof ProposalParseError
          ? `Couldn't read the suggested decision: ${e.message}`
          : e instanceof ProviderError
            ? e.message
            : String(e)
      pushEntry({ kind: 'error', text: message })
      if (signal) await speak('I could not finish that request. Try saying it again.', loadSettings(), signal)
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
    if (!canRecord || phase !== 'idle' || pendingMic.current || handsFree.status) return
    const request = new AbortController()
    pendingMic.current = request
    let stream: MediaStream | undefined
    try {
      const inputStream = await navigator.mediaDevices.getUserMedia({ audio: true })
      stream = inputStream
      if (request.signal.aborted) {
        inputStream.getTracks().forEach((track) => track.stop())
        return
      }
      const mimeType = pickRecordingMimeType()
      const recorder = new MediaRecorder(inputStream, mimeType ? { mimeType } : undefined)
      chunksRef.current = []
      cancelledRef.current = false
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }
      recorder.onstop = () => {
        inputStream.getTracks().forEach((t) => t.stop())
        if (timerRef.current !== null) {
          window.clearInterval(timerRef.current)
          timerRef.current = null
        }
        if (cancelledRef.current) {
          setPhase('idle')
          setElapsed(0)
          return
        }
        const type = resolveRecordingMimeType(recorder.mimeType, mimeType)
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
      stream?.getTracks().forEach((track) => track.stop())
      if (request.signal.aborted) return
      const message =
        e instanceof DOMException && e.name === 'NotAllowedError'
          ? 'Microphone permission was denied — allow the mic for this site and try again.'
          : `Could not start the microphone: ${e instanceof Error ? e.message : String(e)}`
      pushEntry({ kind: 'error', text: message })
    } finally {
      if (pendingMic.current === request) pendingMic.current = null
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

  const approve = async (cardId: number, skeleton: DecisionSkeletonInput, signal?: AbortSignal) => {
    if (applying.current) return
    applying.current = true
    setSaving(true)
    try {
      const decision = await applyDecisionSkeleton(skeleton)
      const bundle = await queryDecision(decision.id)
      if (signal && !signal.aborted) {
        await speak('Decision saved. Open Hands-free in Ask AI to work through the choice.', loadSettings(), signal)
      }
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
      if (signal && !signal.aborted) {
        await speak('I could not save the decision. Review the error and try again.', loadSettings(), signal)
      }
    } finally {
      applying.current = false
      setSaving(false)
    }
  }

  async function readReview(skeleton: DecisionSkeletonInput, signal: AbortSignal) {
    voicedReview.current = null
    const rows = [`Create ${skeleton.name}`]
    for (const option of skeleton.options) {
      rows.push(`Add option ${option.name}${option.notes ? `, with notes: ${option.notes}` : ''}`)
    }
    for (const dimension of skeleton.dimensions) {
      const scale = dimension.unit ? `, measured in ${dimension.unit}` : ''
      const direction = dimension.direction ? `, ${dimension.direction} is better` : ''
      rows.push(`Add ${dimension.name} as ${dimension.kind}, importance ${dimension.importance} out of 5${scale}${direction}`)
    }
    for (const score of skeleton.scores ?? []) {
      rows.push(`${score.dimension} for ${score.option}: ${score.labels?.join(', ') ?? score.value}`)
    }
    const help = 'Say “save changes” or “discard changes.”'
    pushEntry({ kind: 'assistant', text: `**Proposed decision**\n\n${rows.map((row) => `- ${row}`).join('\n')}\n\n${help}` })
    await speak(`${rows.join('. ')}. ${help}`, loadSettings(), signal)
    if (!signal.aborted) voicedReview.current = JSON.stringify(skeleton)
  }

  async function startGuidance(signal: AbortSignal) {
    voicedReview.current = null
    const draft = reviewRef.current?.()
    if (draft) {
      await readReview(draft, signal)
    } else {
      const text = 'What are you trying to decide?'
      pushEntry({ kind: 'assistant', text })
      await speak(text, loadSettings(), signal)
    }
  }

  async function guidedTurn(text: string, signal: AbortSignal) {
    const command = voiceReviewCommand(text)
    if (!command) {
      await ask(text, 'transcript', signal)
      return
    }
    const card = [...entriesRef.current].reverse().find((entry) => entry.kind === 'card')
    const draft = reviewRef.current?.()
    if (!card) {
      await speak('There are no pending changes. Tell me what you are trying to decide.', loadSettings(), signal)
    } else if (command === 'discard') {
      setEntries((prev) => prev.filter((entry) => entry.id !== card.id))
      voicedReview.current = null
      const reply = 'Draft discarded. What would you like to decide?'
      pushEntry({ kind: 'assistant', text: reply })
      await speak(reply, loadSettings(), signal)
    } else if (!draft) {
      await speak('The draft needs a fix before saving. Tell me what to revise.', loadSettings(), signal)
    } else if (voicedReview.current !== JSON.stringify(draft)) {
      await readReview(draft, signal)
    } else {
      voicedReview.current = null
      await approve(card.id, draft, signal)
    }
  }

  const sendTyped = () => {
    const text = input.trim()
    if (!text || phase !== 'idle') return
    handsFree.stop()
    pendingMic.current?.abort()
    if (!configured && !onTranscript) {
      setView('settings')
      return
    }
    if (voiceRef.current) unlockSpeech()
    setInput('')
    void ask(text, 'user')
  }

  if (view === 'settings') {
    return (
      <SheetShell label="AI settings" onClose={() => setView('ramble')}>
        <header className="sheet-header shrink-0">
          <div className="sheet-content pb-3 pt-[var(--sheet-pad-top)]">
            <button type="button" className="text-action -ml-2.5"
              onClick={() => setView('ramble')}>
              ← Back to ramble
            </button>
            <h2 tabIndex={-1} data-sheet-title className="section-title">AI settings</h2>
          </div>
        </header>
        <AiSettingsPanel onDone={() => setView('ramble')} />
      </SheetShell>
    )
  }

  return (
    <SheetShell label="Ramble" onClose={onClose}>
      <header className="sheet-header shrink-0">
        <div className="sheet-content sheet-toolbar pb-2 pt-[var(--sheet-pad-top)]">
          <h2 tabIndex={-1} data-sheet-title className="section-title">Ramble</h2>
          <div className="sheet-tools">
            <button
              type="button"
              aria-pressed={voice || !!handsFree.status}
              disabled={!!handsFree.status}
              className={`text-action ${
                voice || handsFree.status ? 'text-accent-ink' : 'text-ink-2'
              }`}
              onClick={toggleVoice}
            >
              Replies {voice || handsFree.status ? 'on' : 'off'}
            </button>
            <button
              type="button"
              disabled={phase === 'recording'}
              className="text-action"
              onClick={() => {
                handsFree.stop()
                pendingMic.current?.abort()
                setView('settings')
              }}
            >
              Settings
            </button>
          </div>
          <button
            type="button"
            aria-label="Close"
            className="sheet-close secondary-action"
            onClick={onClose}
          >
            Close
          </button>
        </div>
      </header>

      <div
        ref={scrollRef}
        role="log"
        aria-label="Conversation"
        aria-live={handsFree.status ? 'off' : 'polite'}
        className="sheet-content min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain py-3"
      >
        {!configured && entries.length === 0 && (
          <div className="surface-card">
            <p className="text-sm text-ink-2">
              Ramble what you're choosing — typed or out loud — and the AI fills in what it can. Set
              up AI first.
            </p>
            <button
              type="button"
              className="primary-action mt-3"
              onClick={() => setView('settings')}
            >
              Set up AI
            </button>
          </div>
        )}
        {configured && entries.length === 0 && phase === 'idle' && (
          <p className="surface-card text-sm text-ink-2">
            {canRecord ? 'Type or record' : 'Type'} what you’re weighing up.
            {onTranscript
              ? ' Ask AI will use the decision you have open.'
              : ' Include any options or priorities you already have in mind.'}
          </p>
        )}
        {entries.map((entry) =>
          entry.kind === 'card' ? (
            <SkeletonCard
              key={`${entry.id}-${entry.rev}`}
              initial={entry.skeleton}
              outcome={entry.outcome}
              applying={saving}
              reviewRef={reviewRef}
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
            <ConversationMessage
              key={entry.id}
              kind={entry.kind === 'transcript' ? 'user' : entry.kind}
              label={entry.kind === 'transcript' ? 'You said' : undefined}
              text={entry.text}
            />
          ),
        )}
        {phase === 'transcribing' && (
          <div className="mr-8 animate-pulse rounded-xl bg-surface px-3 py-2 text-sm text-ink-3">
            Transcribing…
          </div>
        )}
        {phase === 'thinking' && !handsFree.status && (
          <div className="mr-8 animate-pulse rounded-xl bg-surface px-3 py-2 text-sm text-ink-3">
            {loadSettings().webLookup ? 'Looking up…' : 'Thinking…'}
          </div>
        )}
      </div>

      <footer className="action-bar shrink-0">
        <div className="sheet-content pt-2 pb-[var(--sheet-pad-bottom)]">
          {!onTranscript && phase !== 'recording' && (
            <HandsFreeControls
              session={handsFree}
              unavailable={handsFreeReason}
              busy={phase !== 'idle' || saving}
            />
          )}
          {phase === 'recording' ? (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                className="text-action"
                onClick={cancelRecording}
              >
                Cancel
              </button>
              <div className="flex items-center gap-2">
                <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full bg-danger" />
                <span className="text-sm text-danger">Recording</span>
                <span className="font-mono text-sm font-medium text-ink-2">{formatElapsed(elapsed)}</span>
              </div>
              <button
                type="button"
                className="primary-action"
                onClick={stopRecording}
              >
                Stop
              </button>
            </div>
          ) : (
            <form
              className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault()
                sendTyped()
              }}
            >
              <button
                type="button"
                disabled={!canRecord || phase !== 'idle' || !!handsFree.status}
                aria-label="Record a ramble"
                className="secondary-action"
                onClick={() => void startRecording()}
              >
                Record
              </button>
              <input
                ref={inputRef}
                aria-label="Ramble message"
                className="min-h-11 min-w-0 w-full rounded-xl border border-hairline bg-surface-2 px-3 py-2.5 text-base text-ink placeholder:text-ink-3 focus:border-accent"
                placeholder={canRecord ? 'Type or ramble…' : 'Type a message…'}
                value={input}
                onChange={(e) => setInput(e.target.value)}
              />
              <button
                type="submit"
                disabled={phase !== 'idle' || input.trim() === ''}
                className="primary-action"
              >
                Send
              </button>
            </form>
          )}
          {onTranscript && recordingReason && <p className="mt-1 text-sm text-ink-2">{recordingReason}</p>}
        </div>
      </footer>
    </SheetShell>
  )
}
