// Provider clients per PLAN.md Phase-6: native fetch only (no SDK deps),
// tested against recorded responses. OpenAI-compatible covers the openai
// preset, custom endpoints, and the relay (which speaks the same API).
// Phase 13: when webLookup is on, chat() still returns Promise<string> but
// internally loops — OpenAI Responses web_search, Anthropic web_search,
// Gemini google_search. Custom/relay send an OpenAI-shaped tool and surface
// a clear error if the upstream rejects it (no silent fallback).

import { effectiveModel, type AiSettings } from './settings'

export class ProviderError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message)
  }
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export const LOOKUP_UNSUPPORTED = 'This endpoint cannot look up the web.'

const MAX_LOOKUP_TURNS = 4
const OPENAI_WEB_SEARCH_TOOL = { type: 'web_search' }
const ANTHROPIC_WEB_SEARCH_TOOL = {
  type: 'web_search_20250305',
  name: 'web_search',
  max_uses: 5,
}

const stripTrailingSlash = (url: string) => url.replace(/\/+$/, '')

export async function errorFrom(res: Response, provider: string): Promise<ProviderError> {
  let detail = ''
  try {
    const body = (await res.json()) as { error?: { message?: string } | string; message?: string }
    if (typeof body?.error === 'string') detail = body.error
    else if (body?.error?.message) detail = body.error.message
    else if (body?.message) detail = body.message
  } catch {
    /* non-JSON error body */
  }
  return new ProviderError(
    detail ? `${provider} error (${res.status}): ${detail}` : `${provider} error (${res.status})`,
    res.status,
  )
}

interface Source {
  title?: string
  url: string
}

function withSources(text: string, sources: Source[]): string {
  const seen = new Set<string>()
  const extra: Source[] = []
  for (const s of sources) {
    if (!s.url || seen.has(s.url) || text.includes(s.url)) continue
    seen.add(s.url)
    extra.push(s)
  }
  if (extra.length === 0) return text
  return `${text}\n\nSources:\n${extra.map((s) => `- ${s.title || s.url} (${s.url})`).join('\n')}`
}

function remapLookupUnsupported(err: ProviderError): ProviderError {
  if (err.status === 400 || err.status === 404 || err.status === 422) {
    return new ProviderError(LOOKUP_UNSUPPORTED, err.status)
  }
  return err
}

async function openAiCompatibleChat(
  baseUrl: string,
  apiKey: string,
  model: string,
  messages: ChatMessage[],
  webLookup = false,
): Promise<string> {
  const res = await fetch(`${stripTrailingSlash(baseUrl)}/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      messages,
      ...(webLookup ? { tools: [OPENAI_WEB_SEARCH_TOOL] } : {}),
    }),
  })
  if (!res.ok) {
    const err = await errorFrom(res, 'provider')
    throw webLookup ? remapLookupUnsupported(err) : err
  }
  const body = (await res.json()) as {
    choices?: {
      message?: {
        content?: string
        annotations?: { type?: string; url?: string; title?: string; url_citation?: { url?: string; title?: string } }[]
      }
    }[]
  }
  const message = body.choices?.[0]?.message
  const text = message?.content
  if (typeof text !== 'string') throw new ProviderError('provider returned no message content')
  const sources: Source[] = []
  for (const a of message?.annotations ?? []) {
    const url = a.url || a.url_citation?.url
    if (url) sources.push({ url, title: a.title || a.url_citation?.title })
  }
  return withSources(text, sources)
}

interface ResponsesBody {
  id?: string
  status?: string
  output_text?: string
  output?: {
    type: string
    content?: {
      type: string
      text?: string
      annotations?: { type?: string; url?: string; title?: string }[]
    }[]
  }[]
}

function extractResponses(body: ResponsesBody): { text: string; sources: Source[] } {
  const sources: Source[] = []
  const parts: string[] = []
  if (typeof body.output_text === 'string' && body.output_text) parts.push(body.output_text)
  for (const item of body.output ?? []) {
    if (item.type !== 'message') continue
    for (const block of item.content ?? []) {
      if (block.type === 'output_text' && typeof block.text === 'string') {
        if (!parts.includes(block.text)) parts.push(block.text)
      }
      for (const a of block.annotations ?? []) {
        if (a.url) sources.push({ url: a.url, title: a.title })
      }
    }
  }
  return { text: parts[0] ?? '', sources }
}

async function openAiResponsesChat(
  apiKey: string,
  model: string,
  messages: ChatMessage[],
): Promise<string> {
  let previous: string | undefined
  let lastSources: Source[] = []
  for (let turn = 0; turn < MAX_LOOKUP_TURNS; turn++) {
    const payload: Record<string, unknown> = {
      model,
      tools: [OPENAI_WEB_SEARCH_TOOL],
    }
    if (previous) payload.previous_response_id = previous
    else payload.input = messages.map((m) => ({ role: m.role, content: m.content }))
    const res = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(payload),
    })
    if (!res.ok) throw await errorFrom(res, 'openai')
    const body = (await res.json()) as ResponsesBody
    previous = body.id
    const { text, sources } = extractResponses(body)
    lastSources = lastSources.concat(sources)
    if (text) return withSources(text, lastSources)
    if (body.status !== 'incomplete') break
  }
  throw new ProviderError('openai returned no message content')
}

interface AnthropicBlock {
  type: string
  text?: string
  citations?: { url?: string; title?: string }[]
}

interface AnthropicBody {
  content?: AnthropicBlock[]
  stop_reason?: string
}

function extractAnthropic(body: AnthropicBody): { text: string; sources: Source[] } {
  const sources: Source[] = []
  const text = (body.content ?? [])
    .filter((block) => block.type === 'text' && typeof block.text === 'string')
    .map((block) => {
      for (const c of block.citations ?? []) {
        if (c.url) sources.push({ url: c.url, title: c.title })
      }
      return block.text
    })
    .join('')
  return { text, sources }
}

async function anthropicChat(
  model: string,
  apiKey: string,
  messages: ChatMessage[],
  webLookup = false,
): Promise<string> {
  const system = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n')
  const thread: { role: string; content: string | AnthropicBlock[] }[] = messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({ role: m.role, content: m.content }))
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'x-api-key': apiKey,
    'anthropic-version': '2023-06-01',
  }
  if (webLookup) headers['anthropic-beta'] = 'web-search-2025-03-05'

  let lastSources: Source[] = []
  for (let turn = 0; turn < MAX_LOOKUP_TURNS; turn++) {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model,
        max_tokens: 8192,
        ...(system ? { system } : {}),
        messages: thread,
        ...(webLookup ? { tools: [ANTHROPIC_WEB_SEARCH_TOOL] } : {}),
      }),
    })
    if (!res.ok) throw await errorFrom(res, 'anthropic')
    const body = (await res.json()) as AnthropicBody
    const { text, sources } = extractAnthropic(body)
    lastSources = lastSources.concat(sources)
    if (body.stop_reason === 'pause_turn' && body.content) {
      thread.push({ role: 'assistant', content: body.content })
      continue
    }
    if (!text) throw new ProviderError('anthropic returned no text content')
    return withSources(text, lastSources)
  }
  throw new ProviderError('anthropic lookup did not finish')
}

async function geminiChat(
  model: string,
  apiKey: string,
  messages: ChatMessage[],
  webLookup = false,
): Promise<string> {
  const system = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n')
  const rest = messages.filter((m) => m.role !== 'system')
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
        contents: rest.map((m) => ({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: m.content }],
        })),
        ...(webLookup ? { tools: [{ google_search: {} }] } : {}),
      }),
    },
  )
  if (!res.ok) throw await errorFrom(res, 'gemini')
  const body = (await res.json()) as {
    candidates?: {
      content?: { parts?: { text?: string }[] }
      groundingMetadata?: { groundingChunks?: { web?: { uri?: string; title?: string } }[] }
    }[]
  }
  const candidate = body.candidates?.[0]
  const text = (candidate?.content?.parts ?? []).map((p) => p.text ?? '').join('')
  if (!text) throw new ProviderError('gemini returned no text content')
  const sources: Source[] = []
  for (const chunk of candidate?.groundingMetadata?.groundingChunks ?? []) {
    if (chunk.web?.uri) sources.push({ url: chunk.web.uri, title: chunk.web.title })
  }
  return withSources(text, sources)
}

export async function chat(messages: ChatMessage[], settings: AiSettings): Promise<string> {
  try {
    return await chatInner(messages, settings)
  } catch (e) {
    remapNetworkError(e)
  }
}

function remapNetworkError(e: unknown): never {
  if (e instanceof ProviderError) throw e
  const msg = e instanceof Error ? e.message : String(e)
  if (e instanceof TypeError || /load failed|failed to fetch|networkerror/i.test(msg)) {
    throw new ProviderError("Couldn't reach the AI provider — check your connection and try again.")
  }
  throw e instanceof Error ? e : new ProviderError(msg)
}

async function chatInner(messages: ChatMessage[], settings: AiSettings): Promise<string> {
  const lookup = settings.webLookup === true
  switch (settings.mode) {
    case 'anthropic':
      return anthropicChat(effectiveModel(settings), settings.apiKey.trim(), messages, lookup)
    case 'gemini':
      return geminiChat(effectiveModel(settings), settings.apiKey.trim(), messages, lookup)
    case 'openai':
      return lookup
        ? openAiResponsesChat(settings.apiKey.trim(), effectiveModel(settings), messages)
        : openAiCompatibleChat(
            'https://api.openai.com/v1',
            settings.apiKey.trim(),
            effectiveModel(settings),
            messages,
          )
    case 'custom':
      return openAiCompatibleChat(
        settings.baseUrl.trim(),
        settings.apiKey.trim(),
        effectiveModel(settings),
        messages,
        lookup,
      )
    case 'relay':
      return openAiCompatibleChat(
        settings.relayUrl.trim(),
        settings.relayToken,
        effectiveModel(settings) || 'relay',
        messages,
        lookup,
      )
    default:
      throw new ProviderError('AI is not configured')
  }
}

/** Cheap round-trip proving the credential works (settings-screen "Validate"). */
export async function validateKey(settings: AiSettings): Promise<void> {
  let res: Response
  switch (settings.mode) {
    case 'anthropic':
      res = await fetch('https://api.anthropic.com/v1/models', {
        headers: { 'x-api-key': settings.apiKey.trim(), 'anthropic-version': '2023-06-01' },
      })
      break
    case 'gemini':
      res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(settings.apiKey.trim())}`,
      )
      break
    case 'openai':
      res = await fetch('https://api.openai.com/v1/models', {
        headers: { authorization: `Bearer ${settings.apiKey.trim()}` },
      })
      break
    case 'custom':
      res = await fetch(`${stripTrailingSlash(settings.baseUrl.trim())}/models`, {
        headers: { authorization: `Bearer ${settings.apiKey.trim()}` },
      })
      break
    case 'relay':
      res = await fetch(`${stripTrailingSlash(settings.relayUrl.trim())}/models`, {
        headers: { authorization: `Bearer ${settings.relayToken}` },
      })
      break
    default:
      throw new ProviderError('AI is not configured')
  }
  if (!res.ok) throw await errorFrom(res, settings.mode === 'relay' ? 'relay' : settings.mode)
}
