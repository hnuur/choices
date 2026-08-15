// AI access model per PLAN.md Phase-6: user-selectable provider (BYO-key
// presets + custom OpenAI-compatible endpoint) or the optional operator-run
// relay. Settings live in localStorage — keys stay on-device and no Dexie
// schema is touched (the decision remains the only durable artifact).

import { uid } from '../uid'

export type ProviderPreset = 'anthropic' | 'openai' | 'gemini'
export type AiMode = ProviderPreset | 'custom' | 'relay'

export const DEFAULT_MODELS: Record<ProviderPreset, string> = {
  anthropic: 'claude-3-5-haiku-latest',
  openai: 'gpt-4o-mini',
  gemini: 'gemini-2.0-flash',
}

export interface AiSettings {
  /** null = AI not configured yet. */
  mode: AiMode | null
  apiKey: string
  /** Empty ⇒ the preset default; always explicit for custom mode. */
  model: string
  /** custom mode only. */
  baseUrl: string
  relayUrl: string
  /** Client-generated opaque bearer token identifying this device to the relay. */
  relayToken: string
  /** Phase 10: speak chat replies aloud. */
  voiceReplies: boolean
  /** Phase 13: provider-native web lookup. Default off. */
  webLookup: boolean
}

const STORAGE_KEY = 'choices.ai-settings'

export const newRelayToken = (): string => uid()

export function defaultSettings(): AiSettings {
  return {
    mode: null,
    apiKey: '',
    model: '',
    baseUrl: '',
    relayUrl: '',
    relayToken: newRelayToken(),
    voiceReplies: true,
    webLookup: false,
  }
}

export function loadSettings(): AiSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return defaultSettings()
    const parsed = JSON.parse(raw) as Partial<AiSettings>
    return { ...defaultSettings(), ...parsed }
  } catch {
    return defaultSettings()
  }
}

export function saveSettings(settings: AiSettings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
}

export function isConfigured(settings: AiSettings): boolean {
  switch (settings.mode) {
    case null:
      return false
    case 'relay':
      return settings.relayUrl.trim() !== ''
    case 'custom':
      return (
        settings.baseUrl.trim() !== '' &&
        settings.apiKey.trim() !== '' &&
        settings.model.trim() !== ''
      )
    default:
      return settings.apiKey.trim() !== ''
  }
}

/** The model name sent to the provider; presets fall back to their default. */
export function effectiveModel(settings: AiSettings): string {
  if (settings.mode === 'anthropic' || settings.mode === 'openai' || settings.mode === 'gemini') {
    return settings.model.trim() || DEFAULT_MODELS[settings.mode]
  }
  return settings.model.trim()
}

const LOOKUP_DISCLOSURE = 'Web lookup is on: a search may leave the device via that provider.'

/** Disclosure lines for the AI settings screen (the only disclosure surface). */
export function disclosureFor(settings: AiSettings): string {
  let line: string
  switch (settings.mode) {
    case null:
      return 'AI is off until you pick a provider.'
    case 'relay':
      line =
        'Relay: the operator pays; your messages and this decision go through the relay to its upstream provider.'
      break
    case 'custom':
      line =
        'Custom endpoint: you pay your provider; your messages and this decision go straight from this device to your endpoint.'
      break
    default:
      line = `${settings.mode}: you pay the provider; your messages and this decision go straight from this device to ${settings.mode}.`
  }
  return settings.webLookup ? `${line} ${LOOKUP_DISCLOSURE}` : line
}
