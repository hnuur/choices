// STT client tested against recorded responses (PLAN.md Phase-7 verify):
// no live keys, no mic — native fetch mocked per call, audio a plain Blob.

import { afterEach, describe, expect, it, vi } from 'vitest'
import errorBody from './fixtures/error.json'
import geminiStt from './fixtures/gemini-stt.json'
import whisperTranscription from './fixtures/whisper-transcription.json'
import { defaultSettings, type AiSettings } from './settings'
import { supportsStt, transcribe } from './stt'

const fixture = {
  'whisper-transcription.json': whisperTranscription,
  'gemini-stt.json': geminiStt,
  'error.json': errorBody,
} as const

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

let calls: { url: string; init: RequestInit }[] = []

function stubFetch(responder: (url: string, init: RequestInit) => Response) {
  calls = []
  const mock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    calls.push({ url, init: init ?? {} })
    return responder(url, init ?? {})
  })
  vi.stubGlobal('fetch', mock)
  return mock
}

const settings = (patch: Partial<AiSettings>): AiSettings => ({ ...defaultSettings(), ...patch })
const audio = (bytes = 'ramble-bytes', type = 'audio/mp4') => new Blob([bytes], { type })

afterEach(() => vi.unstubAllGlobals())

describe('supportsStt', () => {
  it('is true only where a provider has an STT path', () => {
    expect(supportsStt(settings({ mode: 'openai', apiKey: 'k' }))).toBe(true)
    expect(supportsStt(settings({ mode: 'custom', baseUrl: 'https://x.test/v1', apiKey: 'k', model: 'm' }))).toBe(true)
    expect(supportsStt(settings({ mode: 'gemini', apiKey: 'k' }))).toBe(true)
    expect(supportsStt(settings({ mode: 'anthropic', apiKey: 'k' }))).toBe(false)
    expect(supportsStt(settings({ mode: 'relay', relayUrl: 'https://r.test', relayToken: 't' }))).toBe(false)
    expect(supportsStt(defaultSettings())).toBe(false)
  })
})

describe('transcribe', () => {
  it('openai preset posts multipart to /audio/transcriptions with whisper-1', async () => {
    stubFetch(() => jsonResponse(fixture['whisper-transcription.json']))
    // Plain bytes (no ftyp) → no WAV transcode without AudioContext; .m4a name.
    const text = await transcribe(audio(), 'audio/mp4', settings({ mode: 'openai', apiKey: 'sk-test' }))
    expect(text).toContain('Sony A7C II')
    expect(calls[0].url).toBe('https://api.openai.com/v1/audio/transcriptions')
    const headers = calls[0].init.headers as Record<string, string>
    expect(headers.authorization).toBe('Bearer sk-test')
    const form = calls[0].init.body as FormData
    expect(form.get('model')).toBe('whisper-1')
    const file = form.get('file') as File
    expect(file).toBeInstanceOf(Blob)
    // Safari records AAC/mp4 — without AudioContext we still name it .m4a
    expect(file.name).toBe('ramble.m4a')
  })

  it('transcodes Safari mp4 (ftyp) to wav before Whisper when AudioContext works', async () => {
    const samples = new Float32Array([0, 0.1, -0.1, 0])
    vi.stubGlobal(
      'AudioContext',
      vi.fn(function AudioContext() {
        return {
          decodeAudioData: async () => ({
            numberOfChannels: 1,
            sampleRate: 16000,
            length: samples.length,
            getChannelData: () => samples,
          }),
          close: async () => undefined,
        }
      }),
    )
    stubFetch(() => jsonResponse(fixture['whisper-transcription.json']))
    const ftyp = new Uint8Array(24)
    ftyp[4] = 0x66
    ftyp[5] = 0x74
    ftyp[6] = 0x79
    ftyp[7] = 0x70
    await transcribe(
      new Blob([ftyp], { type: 'audio/mp4' }),
      'audio/mp4',
      settings({ mode: 'openai', apiKey: 'k' }),
    )
    const file = (calls[0].init.body as FormData).get('file') as File
    expect(file.name).toBe('ramble.wav')
  })

  it('webm recordings upload as .webm', async () => {
    stubFetch(() => jsonResponse(fixture['whisper-transcription.json']))
    await transcribe(audio('x', 'audio/webm'), 'audio/webm', settings({ mode: 'openai', apiKey: 'k' }))
    const form = calls[0].init.body as FormData
    expect((form.get('file') as File).name).toBe('ramble.webm')
  })

  it('custom mode posts to the user endpoint (trailing slash stripped)', async () => {
    stubFetch(() => jsonResponse(fixture['whisper-transcription.json']))
    await transcribe(
      audio(),
      'audio/mp4',
      settings({ mode: 'custom', baseUrl: 'https://llm.example.com/v1/', apiKey: 'k', model: 'mixtral' }),
    )
    expect(calls[0].url).toBe('https://llm.example.com/v1/audio/transcriptions')
  })

  it('gemini sends base64 inline audio with the recorded mimeType', async () => {
    stubFetch(() => jsonResponse(fixture['gemini-stt.json']))
    const text = await transcribe(audio('abc'), 'audio/mp4', settings({ mode: 'gemini', apiKey: 'g-key' }))
    expect(text).toContain('Fuji X-T5')
    expect(calls[0].url).toContain('generativelanguage.googleapis.com/v1beta/models/')
    expect(calls[0].url).toContain(':generateContent?key=g-key')
    const body = JSON.parse(calls[0].init.body as string) as {
      contents: { parts: { text?: string; inline_data?: { mime_type: string; data: string } }[] }[]
    }
    const inline = body.contents[0].parts.find((p) => p.inline_data)?.inline_data
    expect(inline?.mime_type).toBe('audio/mp4')
    expect(inline?.data).toBe(btoa('abc'))
  })

  it('surfaces provider error bodies as ProviderError', async () => {
    stubFetch(() => jsonResponse(fixture['error.json'], 401))
    await expect(
      transcribe(audio(), 'audio/mp4', settings({ mode: 'openai', apiKey: 'bad' })),
    ).rejects.toThrowError(/Incorrect API key/)
  })

  it('rejects empty gemini transcriptions', async () => {
    stubFetch(() => jsonResponse({ candidates: [{ content: { parts: [] } }] }))
    await expect(
      transcribe(audio(), 'audio/mp4', settings({ mode: 'gemini', apiKey: 'g-key' })),
    ).rejects.toThrowError(/no transcription/)
  })

  it('rejects modes with no STT path', async () => {
    stubFetch(() => jsonResponse({}))
    await expect(
      transcribe(audio(), 'audio/mp4', settings({ mode: 'anthropic', apiKey: 'k' })),
    ).rejects.toThrowError(/no speech-to-text/)
    await expect(
      transcribe(audio(), 'audio/mp4', settings({ mode: 'relay', relayUrl: 'https://r.test', relayToken: 't' })),
    ).rejects.toThrowError(/no speech-to-text/)
  })
})
