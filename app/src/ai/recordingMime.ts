// MediaRecorder mime probing — shared by RambleSheet and ChatSheet.
// Safari records AAC-in-mp4; Chrome/Firefox record webm. Prefer the
// container Whisper (and our WAV transcoder) can actually handle.

const MIME_CANDIDATES_APPLE = ['audio/mp4', 'audio/aac', 'audio/webm', 'audio/ogg;codecs=opus']
const MIME_CANDIDATES_OTHER = ['audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus']

export function isAppleRecordingEngine(
  ua: string = typeof navigator !== 'undefined' ? navigator.userAgent : '',
): boolean {
  return /iPhone|iPad|iPod|Macintosh/.test(ua)
}

export function pickRecordingMimeType(
  isTypeSupported: (t: string) => boolean = (t) =>
    typeof MediaRecorder !== 'undefined' &&
    typeof MediaRecorder.isTypeSupported === 'function' &&
    MediaRecorder.isTypeSupported(t),
  apple: boolean = isAppleRecordingEngine(),
): string | undefined {
  if (typeof isTypeSupported !== 'function') return undefined
  const list = apple ? MIME_CANDIDATES_APPLE : MIME_CANDIDATES_OTHER
  return list.find((t) => {
    try {
      return isTypeSupported(t)
    } catch {
      return false
    }
  })
}

/** After stop(): trust recorder.mimeType, then requested, then platform default. */
export function resolveRecordingMimeType(
  recorderMimeType: string,
  requested?: string,
  blobType?: string,
  apple: boolean = isAppleRecordingEngine(),
): string {
  const pick = (raw: string | undefined) => {
    const base = (raw ?? '').split(';')[0].trim()
    return base || undefined
  }
  return pick(recorderMimeType) || pick(blobType) || pick(requested) || (apple ? 'audio/mp4' : 'audio/webm')
}
