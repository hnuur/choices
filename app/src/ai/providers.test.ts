// Provider clients tested against recorded responses (PLAN.md Phase-6
// verify): no live keys, native fetch mocked per call.

import { afterEach, describe, expect, it, vi } from 'vitest'
import anthropicChat from './fixtures/anthropic-chat.json'
import anthropicSearchFinal from './fixtures/anthropic-search-final.json'
import anthropicSearchPause from './fixtures/anthropic-search-pause.json'
import errorBody from './fixtures/error.json'
import errorUnsupported from './fixtures/error-unsupported.json'
import geminiChat from './fixtures/gemini-chat.json'
import geminiSearch from './fixtures/gemini-search.json'
import modelsList from './fixtures/models.json'
import openaiChat from './fixtures/openai-chat.json'
import openaiResponsesIncomplete from './fixtures/openai-responses-incomplete.json'
import openaiResponsesSearch from './fixtures/openai-responses-search.json'
import { chat, LOOKUP_UNSUPPORTED, ProviderError, validateKey } from './providers'
import { defaultSettings, type AiSettings } from './settings'

const fixture = {
  'openai-chat.json': openaiChat,
  'anthropic-chat.json': anthropicChat,
  'gemini-chat.json': geminiChat,
  'models.json': modelsList,
  'error.json': errorBody,
  'openai-responses-incomplete.json': openaiResponsesIncomplete,
  'openai-responses-search.json': openaiResponsesSearch,
  'anthropic-search-pause.json': anthropicSearchPause,
  'anthropic-search-final.json': anthropicSearchFinal,
  'gemini-search.json': geminiSearch,
  'error-unsupported.json': errorUnsupported,
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

afterEach(() => vi.unstubAllGlobals())

describe('chat', () => {
  it('openai preset posts to api.openai.com with bearer key and default model', async () => {
    stubFetch(() => jsonResponse(fixture['openai-chat.json']))
    const text = await chat(
      [{ role: 'system', content: 'sys' }, { role: 'user', content: 'hi' }],
      settings({ mode: 'openai', apiKey: 'sk-test' }),
    )
    expect(text).toContain('```json')
    expect(calls[0].url).toBe('https://api.openai.com/v1/chat/completions')
    const headers = calls[0].init.headers as Record<string, string>
    expect(headers.authorization).toBe('Bearer sk-test')
    const body = JSON.parse(calls[0].init.body as string) as Record<string, unknown>
    expect(body.model).toBe('gpt-4o-mini')
    expect(body.messages).toHaveLength(2)
  })

  it('custom mode posts to the user endpoint (trailing slash stripped)', async () => {
    stubFetch(() => jsonResponse(fixture['openai-chat.json']))
    await chat(
      [{ role: 'user', content: 'hi' }],
      settings({ mode: 'custom', baseUrl: 'https://llm.example.com/v1/', apiKey: 'k', model: 'mixtral' }),
    )
    expect(calls[0].url).toBe('https://llm.example.com/v1/chat/completions')
    const body = JSON.parse(calls[0].init.body as string) as Record<string, unknown>
    expect(body.model).toBe('mixtral')
  })

  it('relay mode uses the relay url with the device token as bearer', async () => {
    stubFetch(() => jsonResponse(fixture['openai-chat.json']))
    await chat(
      [{ role: 'user', content: 'hi' }],
      settings({ mode: 'relay', relayUrl: 'https://relay.example.com', relayToken: 'tok-123' }),
    )
    expect(calls[0].url).toBe('https://relay.example.com/chat/completions')
    const headers = calls[0].init.headers as Record<string, string>
    expect(headers.authorization).toBe('Bearer tok-123')
  })

  it('anthropic sends x-api-key, separates system, joins text blocks', async () => {
    stubFetch(() => jsonResponse(fixture['anthropic-chat.json']))
    const text = await chat(
      [{ role: 'system', content: 'sys' }, { role: 'user', content: 'hi' }],
      settings({ mode: 'anthropic', apiKey: 'sk-ant-test' }),
    )
    expect(text).toContain('```json')
    expect(calls[0].url).toBe('https://api.anthropic.com/v1/messages')
    const headers = calls[0].init.headers as Record<string, string>
    expect(headers['x-api-key']).toBe('sk-ant-test')
    const body = JSON.parse(calls[0].init.body as string) as Record<string, unknown>
    expect(body.system).toBe('sys')
    expect(body.messages).toEqual([{ role: 'user', content: 'hi' }])
    expect(body.tools).toBeUndefined()
  })

  it('gemini puts the key in the url, maps roles, joins parts', async () => {
    stubFetch(() => jsonResponse(fixture['gemini-chat.json']))
    const text = await chat(
      [
        { role: 'system', content: 'sys' },
        { role: 'user', content: 'hi' },
        { role: 'assistant', content: 'hello' },
      ],
      settings({ mode: 'gemini', apiKey: 'g-key' }),
    )
    expect(text).toContain('```json')
    expect(calls[0].url).toContain('generativelanguage.googleapis.com/v1beta/models/')
    expect(calls[0].url).toContain(':generateContent?key=g-key')
    const body = JSON.parse(calls[0].init.body as string) as {
      systemInstruction: { parts: { text: string }[] }
      contents: { role: string }[]
      tools?: unknown
    }
    expect(body.systemInstruction.parts[0].text).toBe('sys')
    expect(body.contents.map((c) => c.role)).toEqual(['user', 'model'])
    expect(body.tools).toBeUndefined()
  })

  it('forwards prior turns untouched so the assistant keeps context', async () => {
    stubFetch(() => jsonResponse(fixture['openai-chat.json']))
    const messages = [
      { role: 'system', content: 'sys' },
      { role: 'user', content: 'first' },
      { role: 'assistant', content: 'earlier reply' },
      { role: 'user', content: 'follow-up' },
    ] as const
    await chat([...messages], settings({ mode: 'openai', apiKey: 'sk-test' }))
    const body = JSON.parse(calls[0].init.body as string) as { messages: unknown[] }
    expect(body.messages).toEqual(messages)
  })

  it('forwards prior turns on anthropic too (roles preserved)', async () => {
    stubFetch(() => jsonResponse(fixture['anthropic-chat.json']))
    await chat(
      [
        { role: 'system', content: 'sys' },
        { role: 'user', content: 'first' },
        { role: 'assistant', content: 'earlier' },
        { role: 'user', content: 'follow-up' },
      ],
      settings({ mode: 'anthropic', apiKey: 'sk-ant' }),
    )
    const body = JSON.parse(calls[0].init.body as string) as { messages: { role: string }[] }
    expect(body.messages.map((m) => m.role)).toEqual(['user', 'assistant', 'user'])
  })

  it('surfaces provider error bodies as ProviderError', async () => {
    stubFetch(() => jsonResponse(fixture['error.json'], 401))
    await expect(
      chat([{ role: 'user', content: 'hi' }], settings({ mode: 'openai', apiKey: 'bad' })),
    ).rejects.toThrowError(/Incorrect API key/)
  })

  it('rewrites a Safari Load failed TypeError into a reachable-provider message', async () => {
    stubFetch(() => {
      throw new TypeError('Load failed')
    })
    await expect(
      chat([{ role: 'user', content: 'hi' }], settings({ mode: 'openai', apiKey: 'sk-test' })),
    ).rejects.toThrowError(/Couldn't reach the AI provider/)
  })

  it('rejects when AI is not configured', async () => {
    stubFetch(() => jsonResponse({}))
    await expect(chat([{ role: 'user', content: 'hi' }], defaultSettings())).rejects.toThrowError(
      ProviderError,
    )
  })

  it('lookup-off openai stays on chat/completions and sends no search tool', async () => {
    stubFetch(() => jsonResponse(fixture['openai-chat.json']))
    await chat([{ role: 'user', content: 'hi' }], settings({ mode: 'openai', apiKey: 'sk-test' }))
    expect(calls[0].url).toBe('https://api.openai.com/v1/chat/completions')
    const body = JSON.parse(calls[0].init.body as string) as Record<string, unknown>
    expect(body.tools).toBeUndefined()
  })

  it('openai lookup posts to /v1/responses, loops search-then-final, cites sources', async () => {
    stubFetch(() => {
      if (calls.length === 1) return jsonResponse(fixture['openai-responses-incomplete.json'])
      return jsonResponse(fixture['openai-responses-search.json'])
    })
    const text = await chat(
      [{ role: 'user', content: 'weight of the A7C II?' }],
      settings({ mode: 'openai', apiKey: 'sk-test', webLookup: true }),
    )
    expect(calls).toHaveLength(2)
    expect(calls[0].url).toBe('https://api.openai.com/v1/responses')
    expect(calls[1].url).toBe('https://api.openai.com/v1/responses')
    const first = JSON.parse(calls[0].init.body as string) as { tools: { type: string }[]; input: unknown }
    expect(first.tools).toEqual([{ type: 'web_search' }])
    expect(first.input).toHaveLength(1)
    const second = JSON.parse(calls[1].init.body as string) as { previous_response_id: string }
    expect(second.previous_response_id).toBe('resp_recorded_phase13_incomplete')
    expect(text).toContain('429 g')
    expect(text).toContain('Sources:')
    expect(text).toContain('https://www.sony.com/a7c-ii')
  })

  it('anthropic lookup sends the web_search tool and continues after pause_turn', async () => {
    stubFetch(() =>
      jsonResponse(
        calls.length === 1 ? fixture['anthropic-search-pause.json'] : fixture['anthropic-search-final.json'],
      ),
    )
    const text = await chat(
      [{ role: 'system', content: 'sys' }, { role: 'user', content: 'weight?' }],
      settings({ mode: 'anthropic', apiKey: 'sk-ant', webLookup: true }),
    )
    expect(calls).toHaveLength(2)
    const first = JSON.parse(calls[0].init.body as string) as {
      tools: { type: string; name: string }[]
    }
    expect(first.tools[0]).toMatchObject({ type: 'web_search_20250305', name: 'web_search' })
    expect((calls[0].init.headers as Record<string, string>)['anthropic-beta']).toBe(
      'web-search-2025-03-05',
    )
    const second = JSON.parse(calls[1].init.body as string) as { messages: { role: string }[] }
    expect(second.messages.map((m) => m.role)).toEqual(['user', 'assistant'])
    expect(text).toContain('429 g')
    expect(text).toContain('https://www.sony.com/a7c-ii')
  })

  it('gemini lookup sends google_search and appends grounding sources', async () => {
    stubFetch(() => jsonResponse(fixture['gemini-search.json']))
    const text = await chat(
      [{ role: 'user', content: 'weight?' }],
      settings({ mode: 'gemini', apiKey: 'g-key', webLookup: true }),
    )
    const body = JSON.parse(calls[0].init.body as string) as { tools: { google_search: object }[] }
    expect(body.tools).toEqual([{ google_search: {} }])
    expect(text).toContain('429 g')
    expect(text).toContain('https://www.sony.com/a7c-ii')
  })

  it('unsupported custom lookup surfaces a visible error (no silent fallback)', async () => {
    stubFetch(() => jsonResponse(fixture['error-unsupported.json'], 400))
    await expect(
      chat(
        [{ role: 'user', content: 'hi' }],
        settings({
          mode: 'custom',
          baseUrl: 'https://llm.example.com/v1',
          apiKey: 'k',
          model: 'mixtral',
          webLookup: true,
        }),
      ),
    ).rejects.toThrowError(LOOKUP_UNSUPPORTED)
    const body = JSON.parse(calls[0].init.body as string) as { tools: unknown }
    expect(body.tools).toEqual([{ type: 'web_search' }])
  })

  it('unsupported relay lookup surfaces the same visible error', async () => {
    stubFetch(() => jsonResponse(fixture['error-unsupported.json'], 400))
    await expect(
      chat(
        [{ role: 'user', content: 'hi' }],
        settings({ mode: 'relay', relayUrl: 'https://relay.example.com', relayToken: 'tok', webLookup: true }),
      ),
    ).rejects.toThrowError(LOOKUP_UNSUPPORTED)
  })
})

describe('validateKey', () => {
  it('round-trips the models endpoint per mode', async () => {
    stubFetch(() => jsonResponse(fixture['models.json']))
    await validateKey(settings({ mode: 'openai', apiKey: 'sk-test' }))
    expect(calls[0].url).toBe('https://api.openai.com/v1/models')
    expect((calls[0].init.headers as Record<string, string>).authorization).toBe('Bearer sk-test')

    await validateKey(settings({ mode: 'anthropic', apiKey: 'sk-ant' }))
    expect(calls[1].url).toBe('https://api.anthropic.com/v1/models')
    expect((calls[1].init.headers as Record<string, string>)['x-api-key']).toBe('sk-ant')

    await validateKey(settings({ mode: 'gemini', apiKey: 'g-key' }))
    expect(calls[2].url).toContain('generativelanguage.googleapis.com/v1beta/models?key=g-key')

    await validateKey(settings({ mode: 'custom', baseUrl: 'https://x.test/v1', apiKey: 'k' }))
    expect(calls[3].url).toBe('https://x.test/v1/models')

    await validateKey(settings({ mode: 'relay', relayUrl: 'https://r.test', relayToken: 'tok' }))
    expect(calls[4].url).toBe('https://r.test/models')
    expect((calls[4].init.headers as Record<string, string>).authorization).toBe('Bearer tok')
  })

  it('fails with the provider message on a bad key', async () => {
    stubFetch(() => jsonResponse(fixture['error.json'], 401))
    await expect(validateKey(settings({ mode: 'openai', apiKey: 'bad' }))).rejects.toThrowError(
      /Incorrect API key/,
    )
  })
})
