import { pickRecordingMimeType, resolveRecordingMimeType } from './recordingMime'

const SAMPLE_INTERVAL = 50
const MIN_SPEECH = 150
const END_SILENCE = 1400
const MAX_SILENCE = 12000
const MAX_TURN = 40000
const SPEECH_LEVEL = 0.016

/** Ignore short sounds and discard quiet windows without sending audio. */
export function speechEndDetector(startedAt: number) {
  let voiceRunAt: number | undefined
  let speechAt: number | undefined
  let lastVoiceAt = startedAt

  return (level: number, now: number): 'speech' | 'quiet' | undefined => {
    if (level >= SPEECH_LEVEL) {
      voiceRunAt ??= now
      if (now - voiceRunAt >= MIN_SPEECH) speechAt ??= voiceRunAt
      lastVoiceAt = now
    } else {
      voiceRunAt = undefined
    }
    if (speechAt !== undefined) {
      if (now - lastVoiceAt >= END_SILENCE || now - speechAt >= MAX_TURN) return 'speech'
    } else if (now - startedAt >= MAX_SILENCE && voiceRunAt === undefined) {
      return 'quiet'
    }
  }
}

export function recordSpokenTurn(
  stream: MediaStream,
  analyser: AnalyserNode,
  signal: AbortSignal,
): Promise<{ audio: Blob; mime: string } | null> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return resolve(null)

    const mimeType = pickRecordingMimeType()
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
    const samples = new Float32Array(analyser.fftSize)
    const detect = speechEndDetector(performance.now())
    const chunks: Blob[] = []
    let keep = false
    let timer = 0
    const cleanup = () => {
      window.clearInterval(timer)
      signal.removeEventListener('abort', cancel)
    }
    const finish = () => {
      window.clearInterval(timer)
      if (recorder.state !== 'inactive') recorder.stop()
    }
    const cancel = () => {
      keep = false
      cleanup()
      finish()
      resolve(null)
    }

    recorder.ondataavailable = (event) => {
      if (event.data.size) chunks.push(event.data)
    }
    recorder.onstop = () => {
      cleanup()
      if (!keep || signal.aborted || chunks.length === 0) return resolve(null)
      const mime = resolveRecordingMimeType(recorder.mimeType, mimeType, chunks[0].type)
      resolve({ audio: new Blob(chunks, { type: mime }), mime })
    }
    recorder.onerror = () => {
      cleanup()
      finish()
      reject(new Error('The microphone stopped recording. Start hands-free to try again.'))
    }

    recorder.start()
    signal.addEventListener('abort', cancel, { once: true })
    timer = window.setInterval(() => {
      analyser.getFloatTimeDomainData(samples)
      let squares = 0
      for (const sample of samples) squares += sample * sample
      const result = detect(Math.sqrt(squares / samples.length), performance.now())
      if (result) {
        keep = result === 'speech'
        finish()
      }
    }, SAMPLE_INTERVAL)
  })
}

export function voiceReviewCommand(text: string): 'save' | 'discard' | 'pause' | undefined {
  switch (text.trim().toLowerCase().replace(/[.!?]+$/, '').trim()) {
    case 'save changes': return 'save'
    case 'discard changes': return 'discard'
    case 'pause listening': return 'pause'
  }
}
