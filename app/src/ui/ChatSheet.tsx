// Chat surface per PLAN.md Phase-6: full-screen bottom sheet, one entry
// point, context implicit from the active tab (tappable chip), transcripts
// ephemeral (in-memory only — leaving the decision resets them).
// Phase-8: the decision view's fixed bottom bar is the peek surface — after
// approve the sheet drops to the bar, which carries the status line.

import { useEffect, useRef, useState } from 'react'
import { applyProposals, describeVoiceProposal, formatApplyError, summarizeApplyOutcomes, type ApplyOutcome } from '../ai/apply'
import { decisionSnapshot, systemPrompt } from '../ai/context'
import { formatPlaceReply } from '../ai/formatPlaceReply'
import { chat, ProviderError, type ChatMessage } from '../ai/providers'
import { parseReply, ProposalParseError, type Proposal } from '../ai/proposals'
import { pickRecordingMimeType, resolveRecordingMimeType } from '../ai/recordingMime'
import { sanitizeProposals } from '../ai/sanitizeProposals'
import { isConfigured, loadSettings, saveSettings } from '../ai/settings'
import { recordingUnavailableReason, transcribe } from '../ai/stt'
import { speak, stopSpeaking, unlockSpeech } from '../ai/tts'
import { queryDecision, type DecisionBundle } from '../queries'
import { voiceReviewCommand } from '../ai/voiceCapture'
import AiSettingsPanel from './AiSettingsPanel'
import ApprovalCard, { reviewableProposals } from './ApprovalCard'
import ConversationMessage from './ConversationMessage'
import HandsFreeControls from './HandsFreeControls'
import SheetShell from './SheetShell'
import { TABS, type Tab } from './tabs'
import { handsFreeUnavailableReason, useHandsFree } from './useHandsFree'

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

/** Don't forward a wall of setScore JSON on the next turn — it blows the request and re-triggers parse errors. */
function compactAssistantDump(text: string): string {
  if (!/"type"\s*:\s*"setScore"/.test(text) || text.length < 400) return text
  try {
    const parsed = parseReply(text)
    if (parsed.proposals.length > 0) {
      const lead =
        parsed.message && !/"type"\s*:\s*"setScore"/.test(parsed.message) ? `${parsed.message}\n\n` : ''
      return `${lead}I proposed ${parsed.proposals.length} score changes on an approval card (not applied until Approve).`
    }
  } catch {
    /* still compact */
  }
  return 'I listed proposed scores as JSON. I will resend a valid json block with exactly one of value or labels per setScore and a distinct optionId per option from the snapshot.'
}

export default function ChatSheet({
  bundle,
  tab,
  state,
  onStateChange,
  onChangeTab,
  onApplied,
  injection,
  onInjectionConsumed,
}: {
  bundle: DecisionBundle
  tab: Tab
  state: ChatState
  onStateChange: (s: ChatState) => void
  onChangeTab: (tab: Tab) => void
  onApplied?: () => void
  /** Ramble-everywhere: a transcript to enter as if typed (nonce re-triggers). */
  injection?: { text: string; nonce: number } | null
  onInjectionConsumed: () => void
}) {
  const [entries, setEntries] = useState<Entry[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const sending = useRef(false)
  const reviewRef = useRef<(() => Proposal[]) | null>(null)
  const voicedReview = useRef<{ id: number; changes: string } | null>(null)
  const applyingCards = useRef(new Set<number>())
  const [applyingCard, setApplyingCard] = useState<number | null>(null)
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
  const pendingMic = useRef<AbortController | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const cancelledRef = useRef(false)
  const timerRef = useRef<number | null>(null)
  const settings = loadSettings()
  const configured = isConfigured(settings)
  const recordingReason = configured ? recordingUnavailableReason(settings) : null
  const canRecord = configured && !recordingReason
  const handsFreeReason = handsFreeUnavailableReason(recordingReason, configured)
  const inChat = useRef(false)
  inChat.current = state === 'full' && view === 'chat'
  const pendingCard = [...entries].reverse().find((entry) => entry.kind === 'card' && !entry.resolved)
  const handsFree = useHandsFree(
    inChat.current && !handsFreeReason,
    (text, signal) => guidedTurn(text, signal),
    (signal) => startGuidance(signal),
  )

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [entries, busy, state])

  // Spoken replies stop when the sheet drops or unmounts.
  const stopRecorder = () => {
    pendingMic.current?.abort()
    pendingMic.current = null
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

  const toggleVoice = () => {
    const next = !voice
    setVoice(next)
    saveSettings({ ...loadSettings(), voiceReplies: next })
    if (!next) stopSpeaking()
    else unlockSpeech()
  }

  const send = async (
    raw?: string,
    signal?: AbortSignal,
    snapshot = bundle,
    showUser = true,
  ) => {
    const text = (raw ?? input).trim()
    if (!text || sending.current || signal?.aborted) return
    pendingMic.current?.abort()
    if (!configured) {
      if (raw !== undefined) setInput(text)
      setView('settings')
      return
    }
    if (!signal && voiceRef.current) unlockSpeech()
    if (raw === undefined) setInput('')
    // Prior turns are forwarded so the assistant keeps context; resolved
    // approval cards join as an assistant turn so it knows what landed.
    const history: ChatMessage[] = entries.flatMap((e): ChatMessage[] => {
      if (e.kind === 'user') return [{ role: 'user', content: e.text }]
      if (e.kind === 'assistant') {
        return [{ role: 'assistant', content: compactAssistantDump(e.text) }]
      }
      if (e.kind === 'error') {
        return [
          {
            role: 'assistant',
            content: `The app reported an error (${e.text}). I must use the decision snapshot and save outcomes to check what persisted, and send valid proposals for any remaining requested changes.`,
          },
        ]
      }
      if (e.kind === 'card') {
        const types = e.proposals.map((p) => p.type).join(', ')
        const status = e.outcomes?.length
          ? summarizeApplyOutcomes(e.outcomes)
          : e.resolved
          ? `The user ${e.resolved} them.`
          : signal ? 'The card is still pending. Continue based on the latest user turn and snapshot.'
          : e.proposals.length > 0
            ? `They are still on an open approval card with ${e.proposals.length} row(s) (${types}) — scores are NOT saved until Approve. If they say scores are missing, wrong, or incomplete, send a NEW complete \`\`\`json block that covers every cell they asked for (use snapshot.unscored). That replacement supersedes this card. Only if they ask whether scores already landed, tell them to Approve or Reject first.`
            : 'They rejected an empty card.'
        return [
          {
            role: 'assistant',
            content: `I proposed: ${types || 'nothing'}. ${status}`,
          },
        ]
      }
      return []
    })
    if (showUser) setEntries((prev) => [...prev, { id: ++entrySeq, kind: 'user', text }])
    sending.current = true
    setBusy(true)
    try {
      const ai = loadSettings()
      const reply = await chat(
        [
          { role: 'system', content: systemPrompt(tabRef.current, ai.webLookup, !!signal) },
          ...history,
          {
            role: 'user',
            content: `Decision snapshot (JSON):\n${decisionSnapshot(snapshot)}\n\n${text}`,
          },
        ],
        ai,
        signal,
      )
      if (signal?.aborted) return
      const parsed = parseReply(reply)
      const displayMessage = (raw: string) => formatPlaceReply(raw.trim())
      const hideDump =
        parsed.proposals.length > 0 && /"type"\s*:\s*"setScore"/.test(parsed.message)
      const prose = parsed.message && !hideDump ? displayMessage(parsed.message) : ''
      const spokenText = prose || (parsed.proposals.length === 0 ? displayMessage(reply) : '')
      const proposalId = ++entrySeq
      setEntries((prev) => {
        const next = [...prev]
        if (prose) next.push({ id: ++entrySeq, kind: 'assistant', text: prose })
        if (parsed.proposals.length > 0) {
          // A fresh proposal card supersedes any still-open card so the user
          // isn't trapped under an incomplete first attempt.
          for (let i = 0; i < next.length; i++) {
            const e = next[i]
            if (e.kind === 'card' && !e.resolved) {
              next[i] = { ...e, outcomes: [], resolved: 'rejected' }
            }
          }
          next.push({ id: proposalId, kind: 'card', proposals: parsed.proposals })
        } else if (!prose && reply.trim()) {
          next.push({ id: ++entrySeq, kind: 'assistant', text: displayMessage(reply) })
        }
        return next
      })
      if (signal && parsed.proposals.length) {
        const prepared = sanitizeProposals(parsed.proposals, snapshot)
        await readReview(proposalId, reviewableProposals(prepared.proposals, snapshot), signal, snapshot)
      } else if (inChat.current && (signal || voiceRef.current) && spokenText) {
        if (signal) await speak(spokenText, loadSettings(), signal)
        else void speak(spokenText, loadSettings())
      }
    } catch (e) {
      if (signal?.aborted) return
      const message =
        e instanceof ProposalParseError
          ? `Couldn't read the suggested changes: ${e.message}`
          : e instanceof ProviderError
            ? e.message
            : String(e)
      setEntries((prev) => [...prev, { id: ++entrySeq, kind: 'error', text: message }])
      if (signal) await speak('I could not finish that request. Try saying it again.', loadSettings(), signal)
    } finally {
      sending.current = false
      setBusy(false)
    }
  }

  const startRecording = async () => {
    if (!canRecord || busy || rec !== 'idle' || pendingMic.current || handsFree.status) return
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
          setRec('idle')
          setElapsed(0)
          return
        }
        const type = resolveRecordingMimeType(recorder.mimeType, mimeType)
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
      stream?.getTracks().forEach((track) => track.stop())
      if (request.signal.aborted) return
      const message =
        e instanceof DOMException && e.name === 'NotAllowedError'
          ? 'Microphone permission was denied — allow the mic for this site and try again.'
          : `Could not start the microphone: ${e instanceof Error ? e.message : String(e)}`
      setEntries((prev) => [...prev, { id: ++entrySeq, kind: 'error', text: message }])
    } finally {
      if (pendingMic.current === request) pendingMic.current = null
    }
  }

  const apply = async (cardId: number, proposals: Proposal[]) => {
    if (applyingCards.current.has(cardId)) return
    applyingCards.current.add(cardId)
    setApplyingCard(cardId)
    try {
      const outcomes = await applyProposals(bundle.decision.id, proposals)
      const failed = outcomes.filter((o) => !o.ok).map((o) => proposals[o.index])
      const errorId = failed.length > 0 ? ++entrySeq : null
      const retryId = failed.length > 0 ? ++entrySeq : null
      setEntries((prev) => {
        const next: Entry[] = prev.map((e) =>
          e.kind === 'card' && e.id === cardId ? { ...e, outcomes, resolved: 'applied' } : e,
        )
        if (errorId !== null && retryId !== null) {
          next.push({ id: errorId, kind: 'error', text: 'Some changes could not be saved. Review the errors above, then edit or retry the failed rows below.' })
          next.push({ id: retryId, kind: 'card', proposals: failed })
        }
        return next
      })
      if (outcomes.some((o) => o.ok)) onApplied?.()
      // Keep failed writes visible; only a successful save drops to peek.
      if (failed.length === 0 && !handsFree.status) onStateChange('peek')
      return outcomes
    } catch (e) {
      setEntries((prev) => [...prev, { id: ++entrySeq, kind: 'error', text: `Could not save changes: ${formatApplyError(e)}. Try Approve again.` }])
    } finally {
      applyingCards.current.delete(cardId)
      setApplyingCard(null)
    }
  }

  const reject = (cardId: number) => {
    setEntries((prev) =>
      prev.map((e) =>
        e.kind === 'card' && e.id === cardId ? { ...e, outcomes: [], resolved: 'rejected' } : e,
      ),
    )
  }

  async function say(text: string, signal: AbortSignal, display = text) {
    setEntries((prev) => [...prev, { id: ++entrySeq, kind: 'assistant', text: display }])
    await speak(text, loadSettings(), signal)
  }

  async function readReview(id: number, changes: Proposal[], signal: AbortSignal, snapshot = bundle) {
    voicedReview.current = null
    if (changes.length === 0) {
      await say('There are no valid changes to save. Tell me what to revise.', signal)
      return
    }
    const rows = changes.map((change) => describeVoiceProposal(change, snapshot))
    const help = 'Say “save changes” or “discard changes.”'
    await say(`Proposed changes. ${rows.join('. ')}. ${help}`, signal,
      `**Proposed changes**\n\n${rows.map((row) => `- ${row}`).join('\n')}\n\n${help}`)
    if (!signal.aborted) voicedReview.current = { id, changes: JSON.stringify(changes) }
  }

  async function startGuidance(signal: AbortSignal) {
    voicedReview.current = null
    if (pendingCard) {
      await readReview(pendingCard.id, reviewRef.current?.() ?? [], signal)
    } else if (entries.some((entry) => entry.kind === 'assistant')) {
      await say('Hands-free is on. You can answer the last question or tell me what to work on.', signal)
    } else {
      await send('Start guiding me through this choice. Ask one question based on the current decision.', signal, bundle, false)
    }
  }

  async function guidedTurn(text: string, signal: AbortSignal) {
    const command = voiceReviewCommand(text)
    if (!command) {
      await send(text, signal)
      return
    }
    if (!pendingCard) {
      await say('There are no pending changes. Tell me what you’d like to change or discuss.', signal)
      return
    }
    const changes = reviewRef.current?.() ?? []
    if (command === 'save' && (
      voicedReview.current?.id !== pendingCard.id || voicedReview.current.changes !== JSON.stringify(changes)
    )) {
      await readReview(pendingCard.id, changes, signal)
      return
    }

    voicedReview.current = null
    let result = 'The proposed changes were discarded.'
    if (command === 'save') {
      if (changes.length === 0) return
      const outcomes = await apply(pendingCard.id, changes)
      if (!outcomes) {
        if (!signal.aborted) await say('I couldn’t save the changes. Review the error and try again.', signal)
        return
      }
      result = summarizeApplyOutcomes(outcomes)
      if (outcomes.some((outcome) => !outcome.ok)) {
        if (!signal.aborted) await say(`${result} Review the remaining changes before saving again.`, signal)
        return
      }
    } else {
      reject(pendingCard.id)
    }
    if (signal.aborted) return
    const updated = await queryDecision(bundle.decision.id)
    if (updated) await send(`${result} Continue the walkthrough from the updated decision.`, signal, updated, false)
  }

  // Pin to visualViewport so the iOS keyboard cannot scroll header/compose away.
  if (view === 'settings') {
    return (
      <SheetShell label="AI settings" onClose={() => setView('chat')}>
        <header className="sheet-header shrink-0">
          <div className="sheet-content pb-3 pt-[var(--sheet-pad-top)]">
            <button type="button" className="text-action -ml-2.5"
              onClick={() => setView('chat')}>
              ← Back to chat
            </button>
            <h2 tabIndex={-1} data-sheet-title className="section-title">AI settings</h2>
          </div>
        </header>
        <AiSettingsPanel onDone={() => setView('chat')} />
      </SheetShell>
    )
  }

  return (
    <SheetShell label="Ask AI" onClose={() => onStateChange('closed')}>
      <header className="sheet-header shrink-0">
        <div className="sheet-content sheet-toolbar pb-2 pt-[var(--sheet-pad-top)]">
          <h2 tabIndex={-1} data-sheet-title className="section-title">Ask AI</h2>
          <div className="sheet-tools">
            <select
              className="min-h-11 max-w-full rounded-xl border border-hairline bg-surface-2 px-2 text-sm"
              value={tab}
              aria-label="AI context"
              onChange={(event) => onChangeTab(event.target.value as Tab)}
            >
              {TABS.map((section) => <option key={section.id} value={section.id}>{section.label}</option>)}
            </select>
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
              disabled={rec === 'recording'}
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
            onClick={() => onStateChange('closed')}
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
        {configured && entries.length === 0 && rec === 'idle' && (
          <p className="surface-card text-sm text-ink-2">
            Ask about your decision or describe a change you’d like to make.
          </p>
        )}
        {!configured && entries.length === 0 && (
          <div className="surface-card">
            <p className="text-sm text-ink-2">
              Ask about dimensions, options, scores or results — but set up AI first.
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
        {entries.map((entry) =>
          entry.kind === 'card' ? (
            <ApprovalCard
              key={entry.id}
              bundle={bundle}
              initial={entry.proposals}
              outcomes={entry.outcomes}
              applying={applyingCard === entry.id}
              reviewRef={entry.id === pendingCard?.id ? reviewRef : undefined}
              onApply={(proposals) => void apply(entry.id, proposals)}
              onReject={() => reject(entry.id)}
            />
          ) : (
            <ConversationMessage key={entry.id} text={entry.text} kind={entry.kind} />
          ),
        )}
        {rec === 'transcribing' && (
          <div className="mr-8 animate-pulse rounded-xl bg-surface px-3 py-2 text-sm text-ink-3">
            Transcribing…
          </div>
        )}
        {busy && !handsFree.status && (
          <div className="mr-8 animate-pulse rounded-xl bg-surface px-3 py-2 text-sm text-ink-3">
            {loadSettings().webLookup ? 'Looking up…' : 'Thinking…'}
          </div>
        )}
      </div>

      <footer className="action-bar shrink-0">
        <div className="sheet-content pt-2 pb-[var(--sheet-pad-bottom)]">
          {rec !== 'recording' && (
            <HandsFreeControls
              session={handsFree}
              unavailable={handsFreeReason}
              busy={busy || rec !== 'idle' || applyingCard !== null}
            />
          )}
          {rec === 'recording' ? (
            <div
              className="flex flex-wrap items-center justify-between gap-2"
            >
              <button
                type="button"
                className="text-action"
                onClick={() => {
                  cancelledRef.current = true
                  recorderRef.current?.stop()
                }}
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
              className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault()
                handsFree.stop()
                void send()
              }}
            >
              <button
                type="button"
                disabled={!canRecord || busy || rec !== 'idle' || !!handsFree.status}
                aria-label="Record a ramble"
                className="secondary-action"
                onClick={() => void startRecording()}
              >
                Record
              </button>
              <input
                aria-label="Ask AI message"
                className="min-h-11 min-w-0 w-full rounded-xl border border-hairline bg-surface-2 px-3 py-2.5 text-base text-ink placeholder:text-ink-3 focus:border-accent"
                placeholder={canRecord ? 'Write or speak…' : 'Type a message…'}
                value={input}
                onChange={(e) => setInput(e.target.value)}
              />
              <button
                type="submit"
                disabled={busy || rec !== 'idle' || input.trim() === ''}
                className="primary-action"
              >
                Send
              </button>
            </form>
          )}
        </div>
      </footer>
    </SheetShell>
  )
}
