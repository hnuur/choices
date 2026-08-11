// Spoken replies per PLAN.md Phase-10: OpenAI neural TTS where the provider
// has it (openai preset; feature-detected on custom endpoints), on-device
// speechSynthesis everywhere else — zero keys, works offline, covers
// anthropic/gemini/relay.

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

let current: HTMLAudioElement | null = null
let currentUrl: string | null = null

export function stopSpeaking(): void {
  if (current) {
    current.onended = null
    current.pause()
    current = null
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
  if (!res.ok || typeof Audio === 'undefined') return false
  const url = URL.createObjectURL(await res.blob())
  currentUrl = url
  current = new Audio(url)
  current.onended = () => {
    URL.revokeObjectURL(url)
    currentUrl = null
    current = null
  }
  await current.play()
  return true
}

export async function speak(text: string, settings: AiSettings): Promise<void> {
  const clean = cleanForSpeech(text)
  if (!clean) return
  stopSpeaking()
  try {
    const engine = voiceEngineFor(settings)
    if (engine === 'openai') {
      if (await speakRemote('https://api.openai.com/v1', settings.apiKey.trim(), clean)) return
    } else if (engine === 'custom') {
      if (await speakRemote(settings.baseUrl.trim(), settings.apiKey.trim(), clean)) return
    }
  } catch {
    /* network or playback failure — fall through to the on-device voice */
  }
  if (typeof speechSynthesis !== 'undefined') {
    speechSynthesis.speak(new SpeechSynthesisUtterance(clean))
  }
}
