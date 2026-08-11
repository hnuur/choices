// Provider clients per PLAN.md Phase-6: native fetch only (no SDK deps),
// tested against recorded responses. OpenAI-compatible covers the openai
// preset, custom endpoints, and the relay (which speaks the same API).

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

const stripTrailingSlash = (url: string) => url.replace(/\/+$/, '')

async function errorFrom(res: Response, provider: string): Promise<ProviderError> {
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

async function openAiCompatibleChat(
  baseUrl: string,
  apiKey: string,
  model: string,
  messages: ChatMessage[],
): Promise<string> {
  const res = await fetch(`${stripTrailingSlash(baseUrl)}/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model, messages }),
  })
  if (!res.ok) throw await errorFrom(res, 'provider')
  const body = (await res.json()) as { choices?: { message?: { content?: string } }[] }
  const text = body.choices?.[0]?.message?.content
  if (typeof text !== 'string') throw new ProviderError('provider returned no message content')
  return text
}

async function anthropicChat(model: string, apiKey: string, messages: ChatMessage[]): Promise<string> {
  const system = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n')
  const rest = messages.filter((m) => m.role !== 'system')
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      ...(system ? { system } : {}),
      messages: rest.map((m) => ({ role: m.role, content: m.content })),
    }),
  })
  if (!res.ok) throw await errorFrom(res, 'anthropic')
  const body = (await res.json()) as { content?: { type: string; text?: string }[] }
  const text = (body.content ?? [])
    .filter((block) => block.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text)
    .join('')
  if (!text) throw new ProviderError('anthropic returned no text content')
  return text
}

async function geminiChat(model: string, apiKey: string, messages: ChatMessage[]): Promise<string> {
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
  if (!text) throw new ProviderError('gemini returned no text content')
  return text
}

export async function chat(messages: ChatMessage[], settings: AiSettings): Promise<string> {
  switch (settings.mode) {
    case 'anthropic':
      return anthropicChat(effectiveModel(settings), settings.apiKey.trim(), messages)
    case 'gemini':
      return geminiChat(effectiveModel(settings), settings.apiKey.trim(), messages)
    case 'openai':
      return openAiCompatibleChat(
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
      )
    case 'relay':
      return openAiCompatibleChat(
        settings.relayUrl.trim(),
        settings.relayToken,
        effectiveModel(settings) || 'relay',
        messages,
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
