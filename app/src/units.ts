// Scale of a dimension's *measurement* (not its 1–5 importance weight).
// Numeric units stay a raw number; anything else (genre, cuisine, …) is
// one or more labels. PLAN.md: "Nominal dimension units".

export type DimensionScale = 'rating' | 'numeric' | 'nominal'

const NUMERIC_UNITS = new Set([
  'g',
  'kg',
  'mg',
  'lb',
  'lbs',
  'oz',
  't',
  'ton',
  'tons',
  'tonne',
  'tonnes',
  'm',
  'cm',
  'mm',
  'km',
  'mi',
  'ft',
  'in',
  'inch',
  'inches',
  'yd',
  'yard',
  'yards',
  'min',
  'mins',
  'minute',
  'minutes',
  'hr',
  'hrs',
  'hour',
  'hours',
  's',
  'sec',
  'secs',
  'second',
  'seconds',
  'ms',
  'day',
  'days',
  'week',
  'weeks',
  'month',
  'months',
  'year',
  'years',
  'yr',
  'yrs',
  '%',
  'percent',
  'pct',
  'usd',
  'eur',
  'gbp',
  'jpy',
  'cad',
  'aud',
  'chf',
  'cny',
  'krw',
  'inr',
  'mxn',
  'sek',
  'nok',
  'dkk',
  '$',
  '€',
  '£',
  '¥',
  '₩',
  '₹',
  'w',
  'watt',
  'watts',
  'kw',
  'kwh',
  'wh',
  'mp',
  'px',
  'pt',
  'b',
  'kb',
  'mb',
  'gb',
  'tb',
  'kib',
  'mib',
  'gib',
  'hz',
  'khz',
  'mhz',
  'ghz',
  'mah',
  'ah',
  'v',
  'mv',
  'kv',
  'a',
  'ma',
  'cal',
  'kcal',
  'j',
  'kj',
  'l',
  'ml',
  'cl',
  'liter',
  'litre',
  'liters',
  'litres',
  'mpg',
  'mph',
  'kph',
  'km/h',
  'm/s',
  'fps',
  '°c',
  '°f',
  'celsius',
  'fahrenheit',
  'db',
  'dpi',
  'psi',
  'bar',
  'atm',
  'ep',
  'episodes',
  'season',
  'seasons',
])

const NOMINAL_NAMES = new Set([
  'genre',
  'genres',
  'cuisine',
  'cuisines',
  'color',
  'colour',
  'colors',
  'colours',
  'brand',
  'brands',
  'platform',
  'platforms',
  'tag',
  'tags',
  'category',
  'categories',
  'mood',
  'moods',
  'style',
  'styles',
])

const GENRES = [
  'Action',
  'Adventure',
  'Animation',
  'Comedy',
  'Crime',
  'Documentary',
  'Drama',
  'Fantasy',
  'Historical',
  'Horror',
  'Mystery',
  'Romance',
  'Sci-Fi',
  'Thriller',
  'Western',
]

const UNIT_PRESETS: Record<string, string[]> = {
  genre: GENRES,
  genres: GENRES,
  cuisine: [
    'American',
    'Chinese',
    'French',
    'Indian',
    'Italian',
    'Japanese',
    'Korean',
    'Mexican',
    'Thai',
    'Vietnamese',
  ],
  cuisines: [
    'American',
    'Chinese',
    'French',
    'Indian',
    'Italian',
    'Japanese',
    'Korean',
    'Mexican',
    'Thai',
    'Vietnamese',
  ],
  color: ['Black', 'Blue', 'Gold', 'Green', 'Grey', 'Red', 'Silver', 'White'],
  colour: ['Black', 'Blue', 'Gold', 'Green', 'Grey', 'Red', 'Silver', 'White'],
  colors: ['Black', 'Blue', 'Gold', 'Green', 'Grey', 'Red', 'Silver', 'White'],
  colours: ['Black', 'Blue', 'Gold', 'Green', 'Grey', 'Red', 'Silver', 'White'],
  platform: ['Android', 'iOS', 'Linux', 'macOS', 'Web', 'Windows'],
  platforms: ['Android', 'iOS', 'Linux', 'macOS', 'Web', 'Windows'],
}

export function foldUnit(s: string): string {
  return s.trim().toLowerCase().replace(/\./g, '')
}

/** Empty / missing unit is numeric (a raw number with no suffix). */
export function isNumericUnit(unit?: string): boolean {
  if (unit === undefined) return true
  const u = foldUnit(unit)
  if (u === '') return true
  if (NUMERIC_UNITS.has(u)) return true
  // "1-5" / "1–4" is the rating scale, not a category name.
  if (/^\d+(\.\d+)?\s*[-–/]\s*\d+(\.\d+)?$/.test(u)) return true
  if (/^[$€£¥₩₹]/.test(unit.trim())) return true
  return false
}

export function isNominalName(name?: string): boolean {
  return !!name && NOMINAL_NAMES.has(foldUnit(name))
}

export function dimensionScale(d: {
  kind: string
  unit?: string
  name?: string
}): DimensionScale {
  if (d.kind === 'subjective') return 'rating'
  const unit = d.unit?.trim()
  if (unit && !isNumericUnit(unit)) return 'nominal'
  if ((!unit || unit === '') && isNominalName(d.name)) return 'nominal'
  return 'numeric'
}

export function normalizeLabels(labels: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of labels) {
    if (typeof raw !== 'string') continue
    const t = raw.trim()
    if (!t) continue
    const key = t.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(t)
  }
  return out
}

export function unitPresets(d: { unit?: string; name?: string }): string[] {
  for (const key of [d.unit, d.name]) {
    if (!key) continue
    const folded = foldUnit(key)
    if (UNIT_PRESETS[folded]) return UNIT_PRESETS[folded]
  }
  return []
}

export function formatLabels(labels: string[]): string {
  return labels.join(', ')
}
