import { describe, expect, it } from 'vitest'
import {
  dimensionScale,
  formatLabels,
  isNumericUnit,
  normalizeLabels,
  unitPresets,
} from './units'

describe('isNumericUnit', () => {
  it('treats empty as numeric (unitless raw number)', () => {
    expect(isNumericUnit(undefined)).toBe(true)
    expect(isNumericUnit('')).toBe(true)
    expect(isNumericUnit('  ')).toBe(true)
  })

  it('recognizes common measures and currencies', () => {
    for (const u of ['g', 'kg', 'min', 'minutes', '€', '$', '%', 'km/h', 'USD']) {
      expect(isNumericUnit(u)).toBe(true)
    }
  })

  it('treats a 1–5 style range as the rating scale, not a category', () => {
    expect(isNumericUnit('1-5')).toBe(true)
    expect(isNumericUnit('1–4')).toBe(true)
  })

  it('treats category words as non-numeric', () => {
    expect(isNumericUnit('genre')).toBe(false)
    expect(isNumericUnit('Genre')).toBe(false)
    expect(isNumericUnit('cuisine')).toBe(false)
  })
})

describe('dimensionScale', () => {
  it('maps subjective to the 1–5 rating', () => {
    expect(dimensionScale({ kind: 'subjective', name: 'Sexiness' })).toBe('rating')
  })

  it('maps objective + numeric/empty unit to numeric', () => {
    expect(dimensionScale({ kind: 'objective', name: 'Weight', unit: 'g' })).toBe('numeric')
    expect(dimensionScale({ kind: 'objective', name: 'Price' })).toBe('numeric')
    expect(dimensionScale({ kind: 'objective', name: 'Episode Length', unit: 'min' })).toBe(
      'numeric',
    )
  })

  it('maps a categorical unit to nominal even if the name is not a category', () => {
    expect(dimensionScale({ kind: 'objective', name: 'Show type', unit: 'genre' })).toBe('nominal')
  })

  it('maps a category name with no unit to nominal (Ask AI Genre card)', () => {
    expect(dimensionScale({ kind: 'objective', name: 'Genre' })).toBe('nominal')
    expect(dimensionScale({ kind: 'objective', name: 'Cuisine' })).toBe('nominal')
  })

  it('lets an explicit numeric unit win over a category name', () => {
    expect(dimensionScale({ kind: 'objective', name: 'Genre', unit: 'g' })).toBe('numeric')
  })
})

describe('normalizeLabels', () => {
  it('trims, drops empties, and de-dupes case-insensitively', () => {
    expect(normalizeLabels([' Drama ', '', 'comedy', 'Drama', 'Comedy'])).toEqual([
      'Drama',
      'comedy',
    ])
  })
})

describe('unitPresets', () => {
  it('seeds genre from the unit or the name', () => {
    expect(unitPresets({ unit: 'genre' })).toContain('Comedy')
    expect(unitPresets({ name: 'Genre' })).toContain('Drama')
  })
})

describe('formatLabels', () => {
  it('joins with a comma', () => {
    expect(formatLabels(['Drama', 'Comedy'])).toBe('Drama, Comedy')
  })
})
