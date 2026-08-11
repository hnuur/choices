// STT client per PLAN.md Phase-7: Whisper (/audio/transcriptions) on the
// openai/custom presets, Gemini inline audio on gemini. anthropic and relay
// have no STT path — supportsStt is false there and the UI greys the mic.
// Native fetch only (no SDK deps), tested against recorded responses.

import { errorFrom, ProviderError } from './providers'
import { effectiveModel, type AiSettings } from './settings'

export type SttMode = 'openai' | 'custom' | 'gemini'

export function supportsStt(settings: AiSettings): boolean {
  return settings.mode === 'openai' || settings.mode === 'custom' || settings.mode === 'gemini'
}

const stripTrailingSlash = (url: string) => url.replace(/\/+$/, '')

// Safari records AAC in an mp4 container; pick an extension Whisper's
// endpoint will accept from the actual recording mimeType.
function extensionFor(mimeType: string): string {
  if (mimeType.includes('mp4') || mimeType.includes('aac')) return 'm4a'
  if (mimeType.includes('ogg')) return 'ogg'
  if (mimeType.includes('wav')) return 'wav'
  return 'webm'
}

async function whisperTranscribe(
  baseUrl: string,
  apiKey: string,
  audio: Blob,
  mimeType: string,
): Promise<string> {
  const form = new FormData()
  form.append('file', audio, `ramble.${extensionFor(mimeType)}`)
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
  const data = base64(await audio.arrayBuffer())
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
              { inline_data: { mime_type: mimeType, data } },
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
