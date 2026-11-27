// AI settings per PLAN.md Phase-6: provider is user-selectable (BYO-key
// presets + custom OpenAI-compatible endpoint + optional relay), keys stay
// on-device, and this screen is the only disclosure surface.

import { useEffect, useRef, useState } from 'react'
import { listModels, ProviderError, validateKey, type AvailableModel } from '../ai/providers'
import {
  effectiveModel,
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
  const [models, setModels] = useState<AvailableModel[] | null>(null)
  const requestId = useRef(0)
  useEffect(() => () => { requestId.current++ }, [])

  const patch = (p: Partial<AiSettings>) => {
    if ('mode' in p || 'apiKey' in p || 'baseUrl' in p || 'relayUrl' in p || 'relayToken' in p) {
      requestId.current++
      setModels(null)
      setValidating(false)
    }
    setSettings((s) => ({ ...s, ...p, ...('mode' in p && p.mode !== s.mode ? { model: '' } : {}) }))
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
    if (settings.mode === null || (settings.mode === 'relay' ? !isConfigured(settings) :
      !settings.apiKey.trim() || (settings.mode === 'custom' && !settings.baseUrl.trim()))) {
      setError('Pick a provider and fill in its fields first.')
      return
    }
    const request = ++requestId.current
    setValidating(true)
    try {
      if (settings.mode === 'relay') {
        await validateKey(settings)
        if (request !== requestId.current) return
        setStatus('Connection OK — the key works.')
      } else {
        const available = await listModels(settings)
        if (request !== requestId.current) return
        const selected = available.find((m) => m.id === effectiveModel(settings))?.id || ''
        setModels(available)
        setSettings((s) => ({ ...s, model: selected }))
        setStatus(`Key validated · ${available.length} available models.${selected ? '' : ' Choose a model to continue.'}`)
      }
    } catch (e) {
      if (request !== requestId.current) return
      setModels(null)
      setError(e instanceof ProviderError ? e.message : String(e))
    } finally {
      if (request === requestId.current) setValidating(false)
    }
  }

  const isPreset =
    settings.mode === 'anthropic' || settings.mode === 'openai' || settings.mode === 'gemini'

  return (
    <div
      className="min-h-0 flex-1 overflow-y-auto px-4"
      style={{ paddingBottom: 'var(--sheet-pad-bottom, calc(env(safe-area-inset-bottom) + 1rem))' }}
    >
      <h2 className="text-lg font-bold">AI settings</h2>
      <p className="mt-1 rounded-lg bg-hover p-3 text-xs text-ink-2">{disclosureFor(settings)}</p>

      <p className={labelClass + ' mt-4'}>Provider</p>
      <div className="grid grid-cols-2 gap-1">
        {MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => patch({ mode: m.id })}
            className={`min-h-11 rounded-lg px-2 py-2.5 text-sm font-medium ${
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

        </div>
      )}

      {(isPreset || settings.mode === 'custom') && (
        <div className="mt-4">
          <label htmlFor="ai-model" className={labelClass}>Model</label>
          {settings.mode === 'custom' && models === null ? (
            <input id="ai-model" className={inputClass} value={settings.model}
              placeholder="Validate key to load models, or enter a model ID"
              onChange={(e) => patch({ model: e.target.value })} />
          ) : (
            <select id="ai-model" className={inputClass} value={models ? settings.model : ''}
              disabled={models === null || validating}
              onChange={(e) => patch({ model: e.target.value })}>
              <option value="" disabled>{models ? 'Choose an available model' : 'Validate key to load models'}</option>
              {models?.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.name === model.id ? model.id : `${model.name} (${model.id})`}
                </option>
              ))}
            </select>
          )}
          <p className="mt-1 text-xs text-ink-3">
            {models ? 'Models returned by this provider for your key. Choose one, then Save.' :
              settings.mode === 'custom' ? 'Custom endpoints without model listing can use a manually entered model ID.' :
              `Validate your API key to see available text models.${settings.model ? ` Saved model: ${settings.model}.` : ''}`}
          </p>
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
            {validating ? 'Loading models…' : 'Validate key'}
          </button>
          <button
            type="button"
            className="min-h-11 rounded-xl bg-accent px-4 text-sm font-semibold text-on-accent"
            disabled={validating || (isPreset && models === null) || (models !== null && !models.some((m) => m.id === settings.model))}
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
