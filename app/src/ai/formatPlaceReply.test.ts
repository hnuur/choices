import { describe, expect, it } from 'vitest'
import { formatPlaceReply } from './formatPlaceReply'

const MONTREAL_CARD = `Here are some Montreal spots for borscht:

**Restaurant Ermitage** https://restaurantermitage.com/?utm_source=openai
Open now · Ukrainian restaurant · CA$30–80
★ 4.8 (905)
5024 Chem. de la Côte-des-Neiges, Montréal, QC H3V 1G6, Canada
Known for its authentic borscht and cozy atmosphere.

**Leopolis**
Closed · Ukrainian restaurant
★ 3.9 (77)
123 Rue Sainte-Catherine, Montréal, QC H2X 1Y4, Canada
Traditional Ukrainian dishes in a warm, family-run setting.

Sources:
- Example Guide (https://example.com/guide)`

describe('formatPlaceReply', () => {
  it('leaves normal assistant prose alone', () => {
    const plain = 'Try adding a subjective “vibe” dimension with importance 3.'
    expect(formatPlaceReply(plain)).toBe(plain)
  })

  it('strips search cards into name — blurb lines', () => {
    const out = formatPlaceReply(MONTREAL_CARD)
    expect(out).toContain('Restaurant Ermitage — Known for its authentic borscht and cozy atmosphere.')
    expect(out).toContain('Leopolis — Traditional Ukrainian dishes in a warm, family-run setting.')
    expect(out).not.toMatch(/utm_source=openai/)
    expect(out).not.toMatch(/H3V 1G6/)
    expect(out).not.toMatch(/★/)
    expect(out).not.toMatch(/Sources:/)
    expect(out).not.toMatch(/\*\*/)
  })

  it('keeps a short preamble when present', () => {
    const out = formatPlaceReply(MONTREAL_CARD)
    expect(out.startsWith('Here are some Montreal spots for borscht:')).toBe(true)
  })
})
