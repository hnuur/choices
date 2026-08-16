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
  clearSynthWatch()
  if (player) {
    player.onended = null
    player.loop = false
    player.pause()
  }
  if (currentUrl) {
    URL.revokeObjectURL(currentUrl)
    currentUrl = null
  }
  if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel()
}

async function speakRemote(baseUrl: string, apiKey: string, text: string): Promise<boolean> {
  const res = await fetch(`${baseUrl.replace(/\/+$/, '')}/audio/speech`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: 'tts-1', voice: 'alloy', input: text }),
  })
  const a = getPlayer()
  if (!res.ok || !a) return false
  if (currentUrl) {
    URL.revokeObjectURL(currentUrl)
    currentUrl = null
  }
  const url = URL.createObjectURL(await res.blob())
  currentUrl = url
  a.loop = false
  a.volume = 1
  a.onended = () => {
    URL.revokeObjectURL(url)
    if (currentUrl === url) currentUrl = null
  }
  a.src = url
  await a.play()
  return true
}

function speakBrowser(text: string): void {
  if (typeof speechSynthesis === 'undefined') return
  const utterance = new SpeechSynthesisUtterance(text)
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
}

export async function speak(text: string, settings: AiSettings): Promise<void> {
  const clean = cleanForSpeech(text)
  if (!clean) return
  try {
    const engine = voiceEngineFor(settings)
    // Keep the gesture-primed player looping until the blob is ready;
    // pausing it first lets iOS drop the audio session during the fetch.
    if (engine === 'openai') {
      if (await speakRemote('https://api.openai.com/v1', settings.apiKey.trim(), clean)) return
    } else if (engine === 'custom') {
      if (await speakRemote(settings.baseUrl.trim(), settings.apiKey.trim(), clean)) return
    }
  } catch {
    /* network or playback failure — fall through to the on-device voice */
  }
  stopSpeaking()
  speakBrowser(clean)
}
