// Client-side cleanup for web-search place cards. Prompts ask for
// "Name — blurb" but providers still paste addresses, URLs, and stars;
// this enforces the display shape in RambleSheet / ChatSheet.

const URL_RE = /https?:\/\/[^\s)\]>]+/gi
const POSTAL_RE = /\b[A-Z]\d[A-Z]\s?\d[A-Z]\d\b|\b\d{5}(?:-\d{4})?\b/i
const STAR_RE = /[★⭐]\s*\d+(?:\.\d+)?(?:\s*\(\d+\))?/
const HOURS_RE = /^(open now|closed)\b/i
const PRICE_RE = /(?:^|[·•|])\s*(?:CA\$|US\$|\$|€|£)\s*\d+/i
const PHONE_RE = /\b\+?\d[\d\s().-]{7,}\d\b/
const STREET_RE =
  /\b\d{1,5}\s+[\w\s.'-]+(?:st|street|ste|suite|ave|avenue|road|rue|chem\.?|chemin|blvd|boulevard|boul\.?)\b/i

export function stripMarkdownInline(text: string): string {
  return text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/_([^_]+)_/g, '$1')
    .trim()
}

function isMetadataLine(line: string): boolean {
  const t = stripMarkdownInline(line.replace(URL_RE, '').trim())
  if (!t) return true
  if (URL_RE.test(line)) return true
  if (STAR_RE.test(t)) return true
  if (HOURS_RE.test(t)) return true
  if (PRICE_RE.test(t)) return true
  if (PHONE_RE.test(t)) return true
  if (STREET_RE.test(t) && (POSTAL_RE.test(t) || /,\s*(Montréal|Montreal|QC|ON|Canada)/i.test(t))) {
    return true
  }
  if (POSTAL_RE.test(t) && t.includes(',')) return true
  if (
    /^(ukrainian|italian|french|chinese|japanese|mexican|indian|thai|greek|american|canadian)\s+(restaurant|café|cafe|bistro|grill|bar)\b/i.test(
      t,
    )
  ) {
    return true
  }
  if (/·/.test(t) && /restaurant|café|cafe|shop|store|bar/i.test(t) && t.length < 100) return true
  return false
}

function extractName(firstLine: string): string {
  let name = stripMarkdownInline(firstLine.replace(URL_RE, ''))
  if (name.includes('·')) name = name.split('·')[0].trim()
  return name
}

function isPlaceHeader(line: string): boolean {
  const t = line.trim()
  return /^\*\*[^*]+\*\*/.test(t) || /^\[[^\]]+\]\(https?:\/\//i.test(t)
}

function splitBlocks(text: string): string[] {
  const lines = text.split('\n')
  const blocks: string[] = []
  let current: string[] = []

  const flush = () => {
    if (current.some((l) => l.trim())) blocks.push(current.join('\n'))
    current = []
  }

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) {
      if (current.length > 0) flush()
      continue
    }
    const header = isPlaceHeader(trimmed)
    const hasPlaceBody = current.some((l) => isMetadataLine(l))
    if (header && current.length > 0 && hasPlaceBody) {
      flush()
    }
    current.push(line)
  }
  flush()
  return blocks
}

function parsePlaceBlock(block: string): { name: string; blurb: string } | null {
  const lines = block.split('\n').map((l) => l.trim()).filter(Boolean)
  if (lines.length === 0) return null

  const name = extractName(lines[0])
  if (!name || name.length < 2) return null

  const blurbs = lines
    .slice(1)
    .filter((l) => !isMetadataLine(l))
    .map((l) => stripMarkdownInline(l.replace(URL_RE, '')))
    .filter(Boolean)

  const blurb = blurbs.sort((a, b) => b.length - a.length)[0] ?? ''
  if (!blurb || blurb.length < 8) return null
  return { name, blurb }
}

function looksLikePlaceList(text: string): boolean {
  if (!text.trim()) return false
  const hits = [
    /utm_source=openai/i.test(text),
    POSTAL_RE.test(text) && STAR_RE.test(text),
    (text.match(/\*\*[^*]+\*\*/g) ?? []).length >= 2,
    /open now|closed/i.test(text) && /restaurant/i.test(text),
  ].filter(Boolean).length
  if (hits === 0) return false
  return splitBlocks(text).some((b) => parsePlaceBlock(b) !== null)
}

function stripSourcesBlock(text: string): string {
  const idx = text.search(/\n\s*Sources?:\s*\n/i)
  return idx >= 0 ? text.slice(0, idx).trim() : text
}

/** Format web-search place cards into plain "Name — blurb" lines. */
export function formatPlaceReply(text: string): string {
  const trimmed = text.trim()
  if (!trimmed || !looksLikePlaceList(trimmed)) return text

  const body = stripSourcesBlock(trimmed)
  const blocks = splitBlocks(body)
  const places = blocks.map(parsePlaceBlock).filter((p): p is { name: string; blurb: string } => p !== null)
  if (places.length === 0) return text

  const headerMatch = body.match(/^[\s\S]*?(?=\*\*[^*]+\*\*|\[[^\]]+\]\(https?:\/\/)/)
  const preamble = headerMatch?.[0]?.trim().replace(URL_RE, '').trim() ?? ''

  const lines = places.map((p) => `${p.name} — ${p.blurb}`)
  return preamble ? `${preamble}\n\n${lines.join('\n')}` : lines.join('\n')
}
