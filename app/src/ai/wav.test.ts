// WAV encode + Whisper prep: Safari mp4/aac must become .wav before upload.

import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  extensionFor,
  needsWavTranscode,
  prepareForWhisper,
  sniffAudioMime,
} from './stt'
import { encodeWav } from './wav'

function riffWaveHeader(dataSize = 0): Uint8Array {
  const out = new Uint8Array(44 + dataSize)
  const view = new DataView(out.buffer)
  const str = (o: number, s: string) => {
    for (let i = 0; i < s.length; i++) out[o + i] = s.charCodeAt(i)
  }
  str(0, 'RIFF')
  view.setUint32(4, 36 + dataSize, true)
  str(8, 'WAVE')
  str(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, 16000, true)
  view.setUint32(28, 32000, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  str(36, 'data')
  view.setUint32(40, dataSize, true)
  return out
}

/** Minimal ISO BMFF with ftyp at offset 4 (mp4/m4a). */
function ftypBox(): Uint8Array {
  const out = new Uint8Array(24)
  out[0] = 0
  out[1] = 0
  out[2] = 0
  out[3] = 24
  out[4] = 0x66 // f
  out[5] = 0x74 // t
  out[6] = 0x79 // y
  out[7] = 0x70 // p
  // major brand "mp42"
  out[8] = 0x6d
  out[9] = 0x70
  out[10] = 0x34
  out[11] = 0x32
  return out
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('extensionFor / needsWavTranscode', () => {
  it('maps Safari containers to m4a and flags them for WAV transcode', () => {
    expect(extensionFor('audio/mp4')).toBe('m4a')
    expect(extensionFor('audio/mp4;codecs=mp4a.40.2')).toBe('m4a')
    expect(extensionFor('audio/aac')).toBe('m4a')
    expect(extensionFor('audio/x-m4a')).toBe('m4a')
    expect(needsWavTranscode('audio/mp4')).toBe(true)
    expect(needsWavTranscode('audio/aac')).toBe(true)
    expect(needsWavTranscode('')).toBe(true)
    expect(needsWavTranscode('audio/webm')).toBe(false)
    expect(needsWavTranscode('audio/wav')).toBe(false)
  })
})

describe('sniffAudioMime', () => {
  it('detects mp4 ftyp and wav RIFF even when the blob type lies', async () => {
    expect(await sniffAudioMime(new Blob([ftypBox()], { type: 'audio/webm' }))).toBe('audio/mp4')
    expect(await sniffAudioMime(new Blob([riffWaveHeader()], { type: 'application/octet-stream' }))).toBe(
      'audio/wav',
    )
  })
})

describe('encodeWav', () => {
  it('writes a mono PCM WAV header', () => {
    const buffer = {
      numberOfChannels: 1,
      sampleRate: 16000,
      length: 4,
      getChannelData: () => new Float32Array([0, 0.5, -0.5, 1]),
    } as unknown as AudioBuffer
    const wav = encodeWav(buffer)
    expect(wav.type).toBe('audio/wav')
    return wav.arrayBuffer().then((ab) => {
      const bytes = new Uint8Array(ab)
      expect(String.fromCharCode(...bytes.slice(0, 4))).toBe('RIFF')
      expect(String.fromCharCode(...bytes.slice(8, 12))).toBe('WAVE')
      expect(bytes.byteLength).toBe(44 + 8)
    })
  })
})

describe('prepareForWhisper', () => {
  it('leaves webm alone', async () => {
    const webm = new Blob([new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0, 0, 0, 0])], {
      type: 'audio/webm',
    })
    const prepared = await prepareForWhisper(webm, 'audio/webm')
    expect(prepared.filename).toBe('ramble.webm')
    expect(prepared.blob).toBe(webm)
  })

  it('re-encodes Safari mp4 to wav when AudioContext can decode', async () => {
    const samples = new Float32Array([0, 0.25, -0.25, 0])
    const fakeCtx = {
      decodeAudioData: vi.fn(async () => ({
        numberOfChannels: 1,
        sampleRate: 16000,
        length: samples.length,
        getChannelData: () => samples,
      })),
      close: vi.fn(async () => undefined),
    }
    vi.stubGlobal(
      'AudioContext',
      vi.fn(function AudioContext() {
        return fakeCtx
      }),
    )
    const mp4 = new Blob([ftypBox()], { type: 'audio/mp4' })
    const prepared = await prepareForWhisper(mp4, 'audio/mp4')
    expect(prepared.filename).toBe('ramble.wav')
    expect(prepared.mimeType).toBe('audio/wav')
    expect(fakeCtx.decodeAudioData).toHaveBeenCalled()
    const head = new Uint8Array(await prepared.blob.slice(0, 4).arrayBuffer())
    expect(String.fromCharCode(...head)).toBe('RIFF')
  })

  it('sniffs mp4 mislabelled as webm and still transcodes', async () => {
    const samples = new Float32Array([0, 0])
    vi.stubGlobal(
      'AudioContext',
      vi.fn(function AudioContext() {
        return {
          decodeAudioData: async () => ({
            numberOfChannels: 1,
            sampleRate: 8000,
            length: 2,
            getChannelData: () => samples,
          }),
          close: async () => undefined,
        }
      }),
    )
    const lying = new Blob([ftypBox()], { type: 'audio/webm' })
    const prepared = await prepareForWhisper(lying, 'audio/webm')
    expect(prepared.filename).toBe('ramble.wav')
  })

  it('falls back to .m4a when AudioContext is missing (Node)', async () => {
    const mp4 = new Blob([ftypBox()], { type: 'audio/mp4' })
    const prepared = await prepareForWhisper(mp4, 'audio/mp4')
    expect(prepared.filename).toBe('ramble.m4a')
  })
})
