// STT client per PLAN.md Phase-7: Whisper (/audio/transcriptions) on the
// openai/custom presets, Gemini inline audio on gemini. anthropic and relay
// have no STT path — supportsStt is false there and the UI greys the mic.
// Native fetch only (no SDK deps), tested against recorded responses.
//
// Safari MediaRecorder emits AAC-in-mp4 that Whisper often rejects as
// "Invalid file format" even with a .m4a name. Those containers are
// re-encoded to WAV via AudioContext before upload.

import { errorFrom, ProviderError } from './providers'
import { effectiveModel, type AiSettings } from './settings'
import { decodeToWav } from './wav'

export type SttMode = 'openai' | 'custom' | 'gemini'

export function supportsStt(settings: AiSettings): boolean {
  return settings.mode === 'openai' || settings.mode === 'custom' || settings.mode === 'gemini'
}

const stripTrailingSlash = (url: string) => url.replace(/\/+$/, '')

/** True for containers Safari records that Whisper frequently rejects. */
export function needsWavTranscode(mimeType: string): boolean {
  const m = mimeType.toLowerCase()
  return (
    m.includes('mp4') ||
    m.includes('m4a') ||
    m.includes('aac') ||
    m.includes('caf') ||
    m.includes('x-m4a') ||
    m.trim() === ''
  )
}

// Safari records AAC in an mp4 container; pick an extension Whisper's
// endpoint will accept from the actual recording mimeType.
export function extensionFor(mimeType: string): string {
  const m = mimeType.toLowerCase()
  if (m.includes('wav')) return 'wav'
  if (m.includes('mp4') || m.includes('m4a') || m.includes('aac') || m.includes('x-m4a')) return 'm4a'
  if (m.includes('ogg') || m.includes('oga')) return 'ogg'
  if (m.includes('mpeg') || m.includes('mp3') || m.includes('mpga')) return 'mp3'
  return 'webm'
}

/** Peek at magic bytes when the declared mime lies (common on iOS). */
export async function sniffAudioMime(audio: Blob): Promise<string | null> {
  const head = new Uint8Array(await audio.slice(0, 16).arrayBuffer())
  if (head.length < 4) return null
  // ISO BMFF: ....ftyp
  if (
    head.length >= 8 &&
    head[4] === 0x66 &&
    head[5] === 0x74 &&
    head[6] === 0x79 &&
    head[7] === 0x70
  ) {
    return 'audio/mp4'
  }
  // RIFF....WAVE
  if (
    head.length >= 12 &&
    head[0] === 0x52 &&
    head[1] === 0x49 &&
    head[2] === 0x46 &&
    head[3] === 0x46 &&
    head[8] === 0x57 &&
    head[9] === 0x41 &&
    head[10] === 0x56 &&
    head[11] === 0x45
  ) {
    return 'audio/wav'
  }
  // OggS
  if (head[0] === 0x4f && head[1] === 0x67 && head[2] === 0x67 && head[3] === 0x53) {
    return 'audio/ogg'
  }
  // EBML (webm/mkv)
  if (head[0] === 0x1a && head[1] === 0x45 && head[2] === 0xdf && head[3] === 0xa3) {
    return 'audio/webm'
  }
  return null
}

/**
 * Resolve a Whisper-friendly upload: Safari mp4/aac → WAV; otherwise keep
 * the bytes and a matching filename. Falls back to the original blob when
 * AudioContext is missing (Node tests) or decode fails.
 */
export async function prepareForWhisper(
  audio: Blob,
  mimeType: string,
): Promise<{ blob: Blob; filename: string; mimeType: string }> {
  const sniffed = await sniffAudioMime(audio)
  const effective = sniffed ?? mimeType
  if (!needsWavTranscode(effective)) {
    return { blob: audio, filename: `ramble.${extensionFor(effective)}`, mimeType: effective }
  }
  try {
    const wav = await decodeToWav(audio)
    return { blob: wav, filename: 'ramble.wav', mimeType: 'audio/wav' }
  } catch {
    return { blob: audio, filename: `ramble.${extensionFor(effective)}`, mimeType: effective }
  }
}

async function whisperTranscribe(
  baseUrl: string,
  apiKey: string,
  audio: Blob,
  mimeType: string,
): Promise<string> {
  const prepared = await prepareForWhisper(audio, mimeType)
  const form = new FormData()
  form.append('file', prepared.blob, prepared.filename)
  form.append('model', 'whisper-1')
  const res = await fetch(`${stripTrailingSlash(baseUrl)}/audio/transcriptions`, {
    method: 'POST',
    headers: { authorization: `Bearer ${apiKey}` },
    body: form,
  })
  if (!res.ok) throw await errorFrom(res, 'provider')
  const body = (await res.json()) as { text?: string }
  if (typeof body.text !== 'string') throw new ProviderError('provider returned no transcription')
  return body.text
}

function base64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

async function geminiTranscribe(
  model: string,
  apiKey: string,
  audio: Blob,
  mimeType: string,
): Promise<string> {
  // Same Safari containers trip Gemini; prefer WAV when we can re-encode.
  let payload = audio
  let sendMime = mimeType
  if (needsWavTranscode(mimeType) || (await sniffAudioMime(audio)) === 'audio/mp4') {
    try {
      payload = await decodeToWav(audio)
      sendMime = 'audio/wav'
    } catch {
      /* keep original */
    }
  }
  const data = base64(await payload.arrayBuffer())
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [
              { text: 'Transcribe this audio verbatim. Output only the transcript.' },
              { inline_data: { mime_type: sendMime, data } },
            ],
          },
        ],
      }),
    },
  )
  if (!res.ok) throw await errorFrom(res, 'gemini')
  const body = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[]
  }
  const text = (body.candidates?.[0]?.content?.parts ?? [])
    .map((p) => p.text ?? '')
    .join('')
  if (!text) throw new ProviderError('gemini returned no transcription')
  return text
}

export async function transcribe(
  audio: Blob,
  mimeType: string,
  settings: AiSettings,
): Promise<string> {
  switch (settings.mode) {
    case 'openai':
      return whisperTranscribe(
        'https://api.openai.com/v1',
        settings.apiKey.trim(),
        audio,
        mimeType,
      )
    case 'custom':
      return whisperTranscribe(
        settings.baseUrl.trim(),
        settings.apiKey.trim(),
        audio,
        mimeType,
      )
    case 'gemini':
      return geminiTranscribe(effectiveModel(settings), settings.apiKey.trim(), audio, mimeType)
    case 'anthropic':
    case 'relay':
    default:
      throw new ProviderError(
        'this provider has no speech-to-text — voice needs OpenAI, Gemini or a custom endpoint',
      )
  }
}
