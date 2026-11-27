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
import { Field, FieldError, inputClass } from './bits'
import { APP_BUILD_ID, reloadIfStaleBuild } from '../buildId'

const MODES: { id: AiMode; label: string }[] = [
  { id: 'anthropic', label: 'Anthropic' },
  { id: 'openai', label: 'OpenAI' },
  { id: 'gemini', label: 'Gemini' },
  { id: 'custom', label: 'Custom endpoint' },
  { id: 'relay', label: 'Relay (free quota)' },
]


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
  const [checkingUpdate, setCheckingUpdate] = useState(false)
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

  const checkUpdate = async () => {
    setCheckingUpdate(true)
    try {
      const reloading = await reloadIfStaleBuild()
      if (!reloading) setStatus('Already on the latest build.')
    } finally {
      setCheckingUpdate(false)
    }
  }

  return (
    <div
      className="sheet-content min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain pt-4"
      style={{ paddingBottom: 'var(--sheet-pad-bottom, calc(env(safe-area-inset-bottom) + 1rem))' }}
    >
      <section className="surface-card space-y-4" aria-labelledby="provider-settings">
        <h3 id="provider-settings" className="section-title">Provider</h3>
        <Field label="AI provider">
          <select className={inputClass} value={settings.mode ?? ''}
            onChange={(event) => patch({ mode: event.target.value as AiMode })}>
            <option value="" disabled>Choose a provider</option>
            {MODES.map((mode) => <option key={mode.id} value={mode.id}>{mode.label}</option>)}
          </select>
        </Field>

        <p className="text-sm text-ink-2">{disclosureFor(settings)}</p>

        {settings.mode === 'custom' && (
          <Field label="Base URL">
            <input className={inputClass} type="url" autoCapitalize="none"
              placeholder="https://llm.example.com/v1" value={settings.baseUrl}
              onChange={(event) => patch({ baseUrl: event.target.value })} />
          </Field>
        )}

        {(isPreset || settings.mode === 'custom') && (
          <>
            <div>
              <label className="field-label" htmlFor="ai-key">API key</label>
              <div className="flex flex-wrap gap-2">
                <input id="ai-key" className={`${inputClass} flex-1 basis-32`}
                  type={showKey ? 'text' : 'password'} autoComplete="off" autoCapitalize="none" spellCheck={false}
                  value={settings.apiKey} onChange={(event) => patch({ apiKey: event.target.value })} />
                <button type="button" className="secondary-action"
                  aria-label={showKey ? 'Hide API key' : 'Show API key'}
                  onClick={() => setShowKey((value) => !value)}>
                  {showKey ? 'Hide' : 'Show'}
                </button>
              </div>
            </div>

            <div>
              <label htmlFor="ai-model" className="field-label">Model</label>
              {settings.mode === 'custom' && models === null ? (
                <input id="ai-model" className={inputClass} value={settings.model} autoCapitalize="none" spellCheck={false}
                  placeholder="Enter a model ID" aria-describedby="ai-model-help"
                  onChange={(event) => patch({ model: event.target.value })} />
              ) : (
                <select id="ai-model" className={inputClass} value={models ? settings.model : ''}
                  disabled={models === null || validating} aria-describedby="ai-model-help"
                  onChange={(event) => patch({ model: event.target.value })}>
                  <option value="" disabled>{models ? 'Choose an available model' : 'Validate key to load models'}</option>
                  {models?.map((model) => (
                    <option key={model.id} value={model.id}>
                      {model.name === model.id ? model.id : `${model.name} (${model.id})`}
                    </option>
                  ))}
                </select>
              )}
              <p id="ai-model-help" className="mt-2 text-sm text-ink-3">
                {models ? 'Choose a model your provider returned for this key.' :
                  settings.mode === 'custom' ? 'Validate the key to list models, or enter a model ID.' :
                  `Validate your API key to see available text models.${settings.model ? ` Saved model: ${settings.model}.` : ''}`}
              </p>
            </div>
          </>
        )}

        {settings.mode === 'relay' && (
          <>
            <Field label="Relay URL">
              <input className={inputClass} type="url" autoCapitalize="none" value={settings.relayUrl}
                placeholder="https://relay.example.com" onChange={(event) => patch({ relayUrl: event.target.value })} />
            </Field>
            <div>
              <label className="field-label" htmlFor="relay-device-token">Device token</label>
              <div className="flex flex-wrap gap-2">
                <input id="relay-device-token" className={`${inputClass} flex-1 basis-32`} readOnly value={settings.relayToken} />
                <button type="button" className="secondary-action" onClick={() => patch({ relayToken: newRelayToken() })}>
                  New token
                </button>
              </div>
              <p className="mt-2 text-sm text-ink-3">Identifies this device for the relay quota.</p>
            </div>
          </>
        )}

      </section>

      {settings.mode && (
        <section className="surface-card">
          <label className="flex min-h-11 flex-wrap items-center justify-between gap-3">
            <span className="font-semibold">Web lookup</span>
            <input type="checkbox" role="switch" className="settings-switch" checked={settings.webLookup}
              aria-describedby="web-lookup-help"
              onChange={(event) => patch({ webLookup: event.target.checked })} />
          </label>
          <p id="web-lookup-help" className="text-sm text-ink-2">
            {settings.mode === 'custom' || settings.mode === 'relay'
              ? 'Works when this endpoint supports web search.'
              : 'Lets Ask AI and Ramble look up objective facts.'}
          </p>
        </section>
      )}

      <div>
        {settings.mode && (
          <div className="flex flex-wrap gap-2 border-t border-divider pt-3">
            <button type="button" className="secondary-action" disabled={validating} onClick={() => void validate()}>
              {validating ? 'Loading models…' : 'Validate key'}
            </button>
            <button type="button" className="primary-action"
              disabled={validating || (isPreset && models === null) || (models !== null && !models.some((m) => m.id === settings.model))}
              onClick={save}>
              Save
            </button>
          </div>
        )}
        {error && <FieldError message={error} />}
        {status && <p role="status" className="text-sm text-accent-ink">{status}</p>}
      </div>

      <section className="surface-card" aria-labelledby="voice-privacy">
        <h3 id="voice-privacy" className="section-title">Voice privacy</h3>
        <p className="mt-2 text-sm text-ink-2">
          Hands-free detects pauses on this device and sends completed turns to your speech-to-text provider.
        </p>
      </section>

      <section className="surface-card" aria-labelledby="choices-updates">
        <h3 id="choices-updates" className="section-title">App updates</h3>
        <p className="mt-2 text-sm text-ink-3">Build <span className="tabular-nums">{APP_BUILD_ID}</span></p>
        <button type="button" className="text-action -ml-2" disabled={checkingUpdate} onClick={() => void checkUpdate()}>
          {checkingUpdate ? 'Checking…' : 'Check for update'}
        </button>
      </section>
    </div>
  )
}
