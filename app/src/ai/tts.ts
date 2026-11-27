// Spoken replies per PLAN.md Phase-10: OpenAI `/audio/speech` (same BYO key,
// tts-1) on the openai preset, feature-detected `/audio/speech` on custom
// endpoints, and the on-device `speechSynthesis` voice everywhere else —
// zero keys, works offline, covers anthropic/gemini/relay.
//
// iOS Safari/PWA only lets Audio.play() and speechSynthesis.speak() start
// from a user gesture. Replies arrive after STT+chat, so Stop/Send must
// prime a reused element; later speak() swaps in the real audio.

import type { AiSettings } from './settings'

export type VoiceEngine = 'openai' | 'custom' | 'browser'

export function voiceEngineFor(settings: AiSettings): VoiceEngine {
  if (settings.mode === 'openai' && settings.apiKey.trim() !== '') return 'openai'
  if (settings.mode === 'custom' && settings.baseUrl.trim() !== '') return 'custom'
  return 'browser'
}

/** Fenced code and markdown noise would garble a spoken reply. */
export function cleanForSpeech(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/\[([^\]]+)\]\(https?:\/\/[^\s)]+\)/g, '$1')
    .replace(/^\s*[-+*]\s+/gm, '')
    .replace(/[`*#_]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

// Near-silent PCM wav so a gesture can hold the iOS audio session without
// a spoken "uh". Volume stays above 0 — muted play() does not unlock later
// unmuted playback.
const SILENCE =
  'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA'

let player: HTMLAudioElement | null = null
let currentUrl: string | null = null
let synthWatch: ReturnType<typeof setInterval> | null = null
let finishPlayback: (() => void) | undefined
// Closing a sheet or starting a newer reply invalidates pending audio work.
let speechGeneration = 0

function getPlayer(): HTMLAudioElement | null {
  if (typeof Audio === 'undefined') return null
  if (!player) {
    player = new Audio()
    player.setAttribute('playsinline', 'true')
  }
  return player
}

function clearSynthWatch(): void {
  if (synthWatch !== null) {
    clearInterval(synthWatch)
    synthWatch = null
  }
}

/** Call from a tap (Voice on, Stop, Send) so a later speak() is allowed. */
export function unlockSpeech(): void {
  if (typeof speechSynthesis !== 'undefined') {
    speechSynthesis.getVoices()
    const prime = new SpeechSynthesisUtterance(' ')
    prime.volume = 0.01
    prime.rate = 2
    speechSynthesis.speak(prime)
  }
  const a = getPlayer()
  if (!a) return
  a.loop = true
  a.volume = 0.01
  a.src = SILENCE
  void a.play().catch(() => {
    /* gesture already spent, or no audio output — speak() still tries */
  })
}

export function stopSpeaking(): void {
  speechGeneration++
  clearSynthWatch()
  if (player) {
    player.onended = null
    player.onerror = null
    player.loop = false
    player.pause()
  }
  if (currentUrl) {
    URL.revokeObjectURL(currentUrl)
    currentUrl = null
  }
  if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel()
  finishPlayback?.()
}

function playbackFinished(signal: AbortSignal): Promise<void> {
  finishPlayback?.()
  return new Promise((resolve) => {
    const timeout = setTimeout(stopSpeaking, 120000)
    const finish = () => {
      clearTimeout(timeout)
      signal.removeEventListener('abort', finish)
      if (finishPlayback === finish) finishPlayback = undefined
      resolve()
    }
    finishPlayback = finish
    if (signal.aborted) finish()
    else signal.addEventListener('abort', finish, { once: true })
  })
}

async function speakRemote(
  baseUrl: string, apiKey: string, text: string, generation: number, signal?: AbortSignal,
): Promise<boolean> {
  const res = await fetch(`${baseUrl.replace(/\/+$/, '')}/audio/speech`, {
    method: 'POST',
    ...(signal ? { signal } : {}),
    headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: 'tts-1', voice: 'alloy', input: text }),
  })
  if (generation !== speechGeneration) return true
  const a = getPlayer()
  if (!res.ok || !a) return false
  const blob = await res.blob()
  if (generation !== speechGeneration) return true
  if (currentUrl) {
    URL.revokeObjectURL(currentUrl)
    currentUrl = null
  }
  const url = URL.createObjectURL(blob)
  currentUrl = url
  a.loop = false
  a.volume = 1
  const finished = signal ? playbackFinished(signal) : undefined
  const done = finishPlayback
  let failed = false
  a.onended = () => {
    URL.revokeObjectURL(url)
    if (currentUrl === url) currentUrl = null
    done?.()
  }
  a.onerror = () => {
    failed = true
    done?.()
  }
  a.src = url
  const play = a.play()
  if (finished) await Promise.race([play.then(() => finished), finished])
  else await play
  return !failed
}

function speakBrowser(text: string, signal?: AbortSignal): Promise<void> | undefined {
  if (typeof speechSynthesis === 'undefined') return
  const utterance = new SpeechSynthesisUtterance(text)
  const finished = signal ? playbackFinished(signal) : undefined
  const done = finishPlayback
  utterance.onend = utterance.onerror = () => {
    clearSynthWatch()
    done?.()
  }
  speechSynthesis.speak(utterance)
  // iOS Safari parks synthesis in a paused state and clips long replies.
  clearSynthWatch()
  synthWatch = setInterval(() => {
    if (typeof speechSynthesis === 'undefined' || !speechSynthesis.speaking) {
      clearSynthWatch()
      return
    }
    speechSynthesis.pause()
    speechSynthesis.resume()
  }, 8000)
  return finished
}

/** Guided turns pass a signal and wait for playback before listening again. */
export async function speak(text: string, settings: AiSettings, signal?: AbortSignal): Promise<void> {
  const clean = cleanForSpeech(text)
  if (!clean || signal?.aborted) return
  const generation = ++speechGeneration
  try {
    const engine = voiceEngineFor(settings)
    // Keep the gesture-primed player looping until the blob is ready;
    // pausing it first lets iOS drop the audio session during the fetch.
    if (engine === 'openai') {
      if (await speakRemote('https://api.openai.com/v1', settings.apiKey.trim(), clean, generation, signal)) return
    } else if (engine === 'custom') {
      if (await speakRemote(settings.baseUrl.trim(), settings.apiKey.trim(), clean, generation, signal)) return
    }
  } catch {
    /* network or playback failure — fall through to the on-device voice */
  }
  if (generation !== speechGeneration || signal?.aborted) return
  stopSpeaking()
  await speakBrowser(clean, signal)
}
