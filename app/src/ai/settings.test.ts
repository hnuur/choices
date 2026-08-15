import { describe, expect, it } from 'vitest'
import { defaultSettings, disclosureFor, type AiSettings } from './settings'

const settings = (patch: Partial<AiSettings>): AiSettings => ({ ...defaultSettings(), ...patch })

describe('disclosureFor', () => {
  it('does not mention lookup when the toggle is off', () => {
    expect(disclosureFor(settings({ mode: 'openai', apiKey: 'k' }))).not.toMatch(/search may leave/)
    expect(disclosureFor(settings({ mode: 'openai', apiKey: 'k', webLookup: false }))).toMatch(
      /straight from this device to openai/,
    )
  })

  it('adds the lookup line when the toggle is on', () => {
    const line = disclosureFor(settings({ mode: 'openai', apiKey: 'k', webLookup: true }))
    expect(line).toContain('Web lookup is on: a search may leave the device via that provider.')
    expect(line).toContain('straight from this device to openai')
  })

  it('defaults webLookup off', () => {
    expect(defaultSettings().webLookup).toBe(false)
  })
})
