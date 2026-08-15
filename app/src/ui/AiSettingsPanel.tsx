// AI settings per PLAN.md Phase-6: provider is user-selectable (BYO-key
// presets + custom OpenAI-compatible endpoint + optional relay), keys stay
// on-device, and this screen is the only disclosure surface.

import { useState } from 'react'
import { ProviderError, validateKey } from '../ai/providers'
import {
  DEFAULT_MODELS,
  disclosureFor,
  isConfigured,
  loadSettings,
  newRelayToken,
  saveSettings,
  type AiMode,
  type AiSettings,
} from '../ai/settings'
import { FieldError, inputClass } from './bits'

const MODES: { id: AiMode; label: string }[] = [
  { id: 'anthropic', label: 'Anthropic' },
  { id: 'openai', label: 'OpenAI' },
  { id: 'gemini', label: 'Gemini' },
  { id: 'custom', label: 'Custom endpoint' },
  { id: 'relay', label: 'Relay (free quota)' },
]

const labelClass = 'mb-1 block text-xs text-ink-3'

export default function AiSettingsPanel({
  onDone,
}: {
  onDone: (settings: AiSettings) => void
}) {
  const [settings, setSettings] = useState<AiSettings>(loadSettings)
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [validating, setValidating] = useState(false)
  const [showKey, setShowKey] = useState(false)

  const patch = (p: Partial<AiSettings>) => {
    setSettings((s) => ({ ...s, ...p }))
    setStatus(null)
    setError(null)
  }

  const save = () => {
    saveSettings(settings)
    onDone(settings)
  }

  const validate = async () => {
    setError(null)
    setStatus(null)
    if (!isConfigured(settings)) {
      setError('Pick a provider and fill in its fields first.')
      return
    }
    setValidating(true)
    try {
      await validateKey(settings)
      setStatus('Connection OK — the key works.')
    } catch (e) {
      setError(e instanceof ProviderError ? e.message : String(e))
    } finally {
      setValidating(false)
    }
  }

  const isPreset =
    settings.mode === 'anthropic' || settings.mode === 'openai' || settings.mode === 'gemini'

  return (
    <div className="flex flex-1 flex-col overflow-y-auto px-4 pb-4">
      <h2 className="text-lg font-bold">AI settings</h2>
      <p className="mt-1 rounded-lg bg-hover p-3 text-xs text-ink-2">{disclosureFor(settings)}</p>

      <p className={labelClass + ' mt-4'}>Provider</p>
      <div className="grid grid-cols-2 gap-1">
        {MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => patch({ mode: m.id })}
            className={`rounded-lg px-2 py-2.5 text-sm font-medium ${
              settings.mode === m.id
                ? 'bg-accent font-semibold text-on-accent'
                : 'border border-hairline bg-surface text-ink-2'
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      {isPreset && (
        <div className="mt-4 space-y-3">
          <div>
            <label className={labelClass}>API key (stored on this device only)</label>
            <div className="flex gap-2">
              <input
                className={inputClass}
                type={showKey ? 'text' : 'password'}
                autoComplete="off"
                placeholder={settings.mode === 'anthropic' ? 'sk-ant-…' : settings.mode === 'gemini' ? 'AIza…' : 'sk-…'}
                value={settings.apiKey}
                onChange={(e) => patch({ apiKey: e.target.value })}
              />
              <button
                type="button"
                className="shrink-0 rounded-xl border border-hairline bg-hover px-3 text-xs font-medium text-ink-2"
                onClick={() => setShowKey((v) => !v)}
              >
                {showKey ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>
          <div>
            <label className={labelClass}>
              Model (blank = {DEFAULT_MODELS[settings.mode as 'anthropic' | 'openai' | 'gemini']})
            </label>
            <input
              className={inputClass}
              placeholder={DEFAULT_MODELS[settings.mode as 'anthropic' | 'openai' | 'gemini']}
              value={settings.model}
              onChange={(e) => patch({ model: e.target.value })}
            />
          </div>
        </div>
      )}

      {settings.mode === 'custom' && (
        <div className="mt-4 space-y-3">
          <div>
            <label className={labelClass}>Base URL (OpenAI-compatible)</label>
            <input
              className={inputClass}
              placeholder="https://llm.example.com/v1"
              value={settings.baseUrl}
              onChange={(e) => patch({ baseUrl: e.target.value })}
            />
          </div>
          <div>
            <label className={labelClass}>API key</label>
            <div className="flex gap-2">
              <input
                className={inputClass}
                type={showKey ? 'text' : 'password'}
                autoComplete="off"
                value={settings.apiKey}
                onChange={(e) => patch({ apiKey: e.target.value })}
              />
              <button
                type="button"
                className="shrink-0 rounded-xl border border-hairline bg-hover px-3 text-xs font-medium text-ink-2"
                onClick={() => setShowKey((v) => !v)}
              >
                {showKey ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>
          <div>
            <label className={labelClass}>Model</label>
            <input
              className={inputClass}
              placeholder="mixtral-8x7b"
              value={settings.model}
              onChange={(e) => patch({ model: e.target.value })}
            />
          </div>
        </div>
      )}

      {settings.mode === 'relay' && (
        <div className="mt-4 space-y-3">
          <div>
            <label className={labelClass}>Relay URL</label>
            <input
              className={inputClass}
              placeholder="https://relay.example.com"
              value={settings.relayUrl}
              onChange={(e) => patch({ relayUrl: e.target.value })}
            />
          </div>
          <div>
            <label className={labelClass}>Device token (opaque; identifies this device for the quota)</label>
            <div className="flex gap-2">
              <input className={inputClass} readOnly value={settings.relayToken} />
              <button
                type="button"
                className="shrink-0 rounded-xl border border-hairline bg-hover px-3 text-xs font-medium text-ink-2"
                onClick={() => patch({ relayToken: newRelayToken() })}
              >
                New token
              </button>
            </div>
          </div>
        </div>
      )}

      {settings.mode && (
        <div className="mt-4">
          <button
            type="button"
            onClick={() => patch({ webLookup: !settings.webLookup })}
            className={`min-h-11 rounded-xl px-4 text-sm font-medium ${
              settings.webLookup
                ? 'bg-accent font-semibold text-on-accent'
                : 'border border-hairline bg-surface text-ink-2'
            }`}
          >
            Web lookup {settings.webLookup ? 'on' : 'off'}
          </button>
          <p className="mt-1 text-xs text-ink-3">
            {settings.mode === 'custom' || settings.mode === 'relay'
              ? 'Off by default. Only works if this endpoint already supports web search.'
              : 'Off by default. Ask AI and ramble may look up objective facts.'}
          </p>
        </div>
      )}

      {settings.mode && (
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            className="min-h-11 rounded-xl border border-hairline bg-hover px-4 text-sm font-medium text-ink-2 disabled:opacity-40"
            disabled={validating}
            onClick={() => void validate()}
          >
            {validating ? 'Checking…' : 'Validate key'}
          </button>
          <button
            type="button"
            className="min-h-11 rounded-xl bg-accent px-4 text-sm font-semibold text-on-accent"
            onClick={save}
          >
            Save
          </button>
        </div>
      )}
      {status && <p className="mt-2 text-xs text-accent-ink">{status}</p>}
      {error && <FieldError message={error} />}
    </div>
  )
}
