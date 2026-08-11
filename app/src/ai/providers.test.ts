// Provider clients tested against recorded responses (PLAN.md Phase-6
// verify): no live keys, native fetch mocked per call.

import { afterEach, describe, expect, it, vi } from 'vitest'
import anthropicChat from './fixtures/anthropic-chat.json'
import errorBody from './fixtures/error.json'
import geminiChat from './fixtures/gemini-chat.json'
import modelsList from './fixtures/models.json'
import openaiChat from './fixtures/openai-chat.json'
import { chat, ProviderError, validateKey } from './providers'
import { defaultSettings, type AiSettings } from './settings'

const fixture = {
  'openai-chat.json': openaiChat,
  'anthropic-chat.json': anthropicChat,
  'gemini-chat.json': geminiChat,
  'models.json': modelsList,
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
    }
    expect(body.systemInstruction.parts[0].text).toBe('sys')
    expect(body.contents.map((c) => c.role)).toEqual(['user', 'model'])
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

  it('rejects when AI is not configured', async () => {
    stubFetch(() => jsonResponse({}))
    await expect(chat([{ role: 'user', content: 'hi' }], defaultSettings())).rejects.toThrowError(
      ProviderError,
    )
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
