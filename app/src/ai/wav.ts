// Encode decoded PCM as a Whisper-friendly WAV. Safari MediaRecorder's
// mp4/aac containers are often rejected by /audio/transcriptions even when
// the extension is correct; re-wrapping through AudioContext fixes that.

function writeString(view: DataView, offset: number, s: string): void {
  for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i))
}

/** Mono (or downmixed) 16-bit PCM WAV from an AudioBuffer. */
export function encodeWav(buffer: AudioBuffer): Blob {
  const channels = buffer.numberOfChannels
  const rate = buffer.sampleRate
  const length = buffer.length
  const data = new Float32Array(length)
  for (let c = 0; c < channels; c++) {
    const samples = buffer.getChannelData(c)
    for (let i = 0; i < length; i++) data[i] += samples[i] / channels
  }

  const bytesPerSample = 2
  const blockAlign = bytesPerSample
  const byteRate = rate * blockAlign
  const dataSize = length * bytesPerSample
  const out = new ArrayBuffer(44 + dataSize)
  const view = new DataView(out)

  writeString(view, 0, 'RIFF')
  view.setUint32(4, 36 + dataSize, true)
  writeString(view, 8, 'WAVE')
  writeString(view, 12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true) // PCM
  view.setUint16(22, 1, true) // mono
  view.setUint32(24, rate, true)
  view.setUint32(28, byteRate, true)
  view.setUint16(32, blockAlign, true)
  view.setUint16(34, 16, true)
  writeString(view, 36, 'data')
  view.setUint32(40, dataSize, true)

  let offset = 44
  for (let i = 0; i < length; i++) {
    const s = Math.max(-1, Math.min(1, data[i]))
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true)
    offset += 2
  }
  return new Blob([out], { type: 'audio/wav' })
}

type AudioContextCtor = new () => AudioContext

function audioContextCtor(): AudioContextCtor | undefined {
  const g = globalThis as typeof globalThis & {
    AudioContext?: AudioContextCtor
    webkitAudioContext?: AudioContextCtor
  }
  return g.AudioContext ?? g.webkitAudioContext
}

/** Decode any MediaRecorder blob the engine can play, return a WAV blob. */
export async function decodeToWav(audio: Blob): Promise<Blob> {
  const Ctor = audioContextCtor()
  if (!Ctor) throw new Error('AudioContext unavailable')
  const ctx = new Ctor()
  try {
    const raw = await audio.arrayBuffer()
    // copy: decodeAudioData may detach the buffer
    const decoded = await ctx.decodeAudioData(raw.slice(0))
    return encodeWav(decoded)
  } finally {
    await ctx.close().catch(() => undefined)
  }
}
