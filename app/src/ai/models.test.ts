import { afterEach, describe, expect, it, vi } from 'vitest'
import { listModels } from './providers'
import { defaultSettings, type AiSettings } from './settings'
const settings = (patch: Partial<AiSettings>): AiSettings => ({ ...defaultSettings(), ...patch })
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })
afterEach(() => vi.unstubAllGlobals())

describe('available model discovery', () => {
  it('uses and deduplicates OpenAI key models and removes incompatible modalities', async () => {
    const fetcher = vi.fn(async () => json({ data: ['gpt-4.1-mini', 'gpt-4.1-mini', 'o3-mini',
      'text-embedding-3-small', 'whisper-1', 'gpt-image-1', 'gpt-4o-realtime-preview',
      'gpt-4o-mini-tts', 'gpt-4o-mini-transcribe'].map(id => ({ id })) }))
    vi.stubGlobal('fetch', fetcher)
    expect(await listModels(settings({ mode: 'openai', apiKey: ' key ' }))).toEqual([
      { id: 'gpt-4.1-mini', name: 'gpt-4.1-mini' }, { id: 'o3-mini', name: 'o3-mini' },
    ])
    expect(fetcher).toHaveBeenCalledWith('https://api.openai.com/v1/models', {
      headers: { authorization: 'Bearer key' },
    })
  })

  it('loads paginated Anthropic IDs and display names with browser access headers', async () => {
    const fetcher = vi.fn(async (url: string) => json(url.includes('after_id=')
      ? { data: [{ id: 'claude-b', display_name: 'Claude B' }], has_more: false }
      : { data: [{ id: 'claude-a', display_name: 'Claude A' }], has_more: true, last_id: 'claude-a' }))
    vi.stubGlobal('fetch', fetcher)
    expect(await listModels(settings({ mode: 'anthropic', apiKey: 'key' }))).toEqual([
      { id: 'claude-a', name: 'Claude A' }, { id: 'claude-b', name: 'Claude B' },
    ])
    expect(fetcher.mock.calls[1][0]).toContain('after_id=claude-a')
  })

  it('paginates Gemini and strips the prefix only for models supporting generateContent', async () => {
    const fetcher = vi.fn(async (url: string) => json(url.includes('pageToken=')
      ? { models: [{ name: 'models/gemini-pro', supportedGenerationMethods: ['generateContent'] }] }
      : { models: [
          { name: 'models/gemini-flash', displayName: 'Gemini Flash', supportedGenerationMethods: ['generateContent'] },
          { name: 'models/embedding', supportedGenerationMethods: ['embedContent'] },
        ], nextPageToken: 'next token' }))
    vi.stubGlobal('fetch', fetcher)
    expect(await listModels(settings({ mode: 'gemini', apiKey: 'key' }))).toEqual([
      { id: 'gemini-flash', name: 'Gemini Flash' }, { id: 'gemini-pro', name: 'gemini-pro' },
    ])
    expect(fetcher.mock.calls[1][0]).toContain('pageToken=next%20token')
  })

  it('discovers arbitrary custom model names without a selected model', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ data: [{ id: 'local-llama' }] })))
    expect(await listModels(settings({ mode: 'custom', baseUrl: 'https://x.test/v1/', apiKey: 'key', model: '' })))
      .toEqual([{ id: 'local-llama', name: 'local-llama' }])
  })

  it('reports authentication, malformed, and empty-list errors', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ error: { message: 'Invalid key' } }, 401)))
    await expect(listModels(settings({ mode: 'openai' }))).rejects.toThrow(/Invalid key/)
    vi.stubGlobal('fetch', vi.fn(async () => json({ unrelated: [] })))
    await expect(listModels(settings({ mode: 'openai' }))).rejects.toThrow(/invalid model list/)
    vi.stubGlobal('fetch', vi.fn(async () => json({ data: [] })))
    await expect(listModels(settings({ mode: 'openai' }))).rejects.toThrow(/No compatible text models/)
  })

  it('rejects incomplete or looping catalogs and operator-controlled relay discovery', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ data: [{ id: 'claude-a' }], has_more: true, last_id: 'same' })))
    await expect(listModels(settings({ mode: 'anthropic' }))).rejects.toThrow(/could not be completed/)
    vi.stubGlobal('fetch', vi.fn(async () => json({ data: [], has_more: true })))
    await expect(listModels(settings({ mode: 'anthropic' }))).rejects.toThrow(/incomplete model list/)
    await expect(listModels(settings({ mode: 'relay' }))).rejects.toThrow(/relay operator/)
  })
})
