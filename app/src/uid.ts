// crypto.randomUUID is secure-contexts-only (https/localhost); the app must
// also work over plain HTTP on a LAN IP, so fall back to random bits.

export function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  const bits = () => Math.random().toString(36).slice(2, 12)
  return `${Date.now().toString(36)}-${bits()}-${bits()}`
}
