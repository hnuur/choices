// Phase-10 verify: TTS engine selection, speech-text cleaning, and the
// remote/fallback paths — hermetic (fetch stubbed; node has no
// speechSynthesis/Audio, so the browser engine is a silent no-op here).

import { afterEach, describe, expect, it, vi } from 'vitest'
import { defaultSettings, type AiSettings } from './settings'
import { cleanForSpeech, speak, voiceEngineFor } from './tts'

const settings = (patch: Partial<AiSettings>): AiSettings => ({ ...defaultSettings(), ...patch })

afterEach(() => vi.unstubAllGlobals())

describe('voiceEngineFor', () => {
  it('openai preset with a key uses OpenAI TTS', () => {
    expect(voiceEngineFor(settings({ mode: 'openai', apiKey: 'sk' }))).toBe('openai')
  })

  it('custom with a base url feature-detects its /audio/speech', () => {
    expect(
      voiceEngineFor(settings({ mode: 'custom', baseUrl: 'https://x.test/v1', apiKey: 'k' })),
    ).toBe('custom')
  })

  it('anthropic, gemini, relay and unconfigured fall back to the browser voice', () => {
    expect(voiceEngineFor(settings({ mode: 'anthropic', apiKey: 'k' }))).toBe('browser')
    expect(voiceEngineFor(settings({ mode: 'gemini', apiKey: 'k' }))).toBe('browser')
    expect(voiceEngineFor(settings({ mode: 'relay', relayUrl: 'https://r.test' }))).toBe('browser')
    expect(voiceEngineFor(defaultSettings())).toBe('browser')
  })
})

describe('cleanForSpeech', () => {
  it('strips fenced code blocks and markdown noise', () => {
    expect(cleanForSpeech('Sure.\n```json\n{"a":1}\n```\nDone *now*')).toBe('Sure. Done now')
  })

  it('collapses whitespace', () => {
    expect(cleanForSpeech('a\n\n  b   c')).toBe('a b c')
  })
})

describe('speak', () => {
  it('posts to /audio/speech on the openai preset', async () => {
    const urls: string[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        urls.push(String(input))
        return new Response('nope', { status: 500 })
      }),
    )
    await speak('hello', settings({ mode: 'openai', apiKey: 'k' }))
    expect(urls).toEqual(['https://api.openai.com/v1/audio/speech'])
  })

  it('falls through silently when the endpoint fails and no browser voice exists', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('down')
      }),
    )
    await expect(speak('hi', settings({ mode: 'openai', apiKey: 'k' }))).resolves.toBeUndefined()
  })

  it('the browser engine never calls fetch', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    await speak('hi', settings({ mode: 'anthropic', apiKey: 'k' }))
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('says nothing for an empty reply', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    await speak(' ```json\n{}\n``` ', settings({ mode: 'openai', apiKey: 'k' }))
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
