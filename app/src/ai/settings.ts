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

/** Disclosure lines for the AI settings screen (the only disclosure surface). */
export function disclosureFor(settings: AiSettings): string {
  switch (settings.mode) {
    case null:
      return 'AI is off until you pick a provider.'
    case 'relay':
      return 'Relay: the operator pays; your messages and this decision go through the relay to its upstream provider.'
    case 'custom':
      return 'Custom endpoint: you pay your provider; your messages and this decision go straight from this device to your endpoint.'
    default:
      return `${settings.mode}: you pay the provider; your messages and this decision go straight from this device to ${settings.mode}.`
  }
}
