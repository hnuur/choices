import { useEffect, useRef, useState } from 'react'
import { loadSettings } from '../ai/settings'
import { transcribe } from '../ai/stt'
import { stopSpeaking, unlockSpeech } from '../ai/tts'
import { recordSpokenTurn, voiceReviewCommand } from '../ai/voiceCapture'

type VoiceStatus = 'Connecting…' | 'Listening…' | 'Transcribing…' | 'Responding…'

/** One foreground session. No recorder runs while the assistant is replying. */
export function useHandsFree(
  allowed: boolean,
  onTurn: (text: string, signal: AbortSignal) => Promise<void>,
  onStart?: (signal: AbortSignal) => Promise<void>,
) {
  const [status, setStatus] = useState<VoiceStatus | null>(null)
  const [error, setError] = useState('')
  const current = useRef<AbortController | null>(null)
  const handlers = useRef({ onTurn, onStart })
  handlers.current = { onTurn, onStart }

  const stop = () => {
    current.current?.abort()
    setStatus(null)
  }

  useEffect(() => {
    if (!allowed) stop()
  }, [allowed])

  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) stop()
    }
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pagehide', stop)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pagehide', stop)
      current.current?.abort()
    }
  }, [])

  const start = async () => {
    if (!allowed || current.current) return
    const controller = new AbortController()
    current.current = controller
    const { signal } = controller
    setError('')
    setStatus('Connecting…')
    let context: AudioContext | undefined
    let stream: MediaStream | undefined
    const release = () => {
      if (current.current === controller) current.current = null
      stream?.getTracks().forEach((track) => track.stop())
      if (context && context.state !== 'closed') void context.close().catch(() => {})
      stopSpeaking()
    }
    signal.addEventListener('abort', release, { once: true })
    try {
      // Both audio output and Web Audio need a Safari user gesture.
      unlockSpeech()
      const audio = new AudioContext()
      context = audio
      void audio.resume().catch(() => {})
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      })
      if (signal.aborted) {
        stream.getTracks().forEach((track) => track.stop())
        return
      }
      if (audio.state !== 'running') {
        let timeout = 0
        const limit = new Promise<void>((resolve) => { timeout = window.setTimeout(resolve, 1500) })
        await Promise.race([audio.resume(), limit]).finally(() => window.clearTimeout(timeout))
      }
      if (signal.aborted) return
      if (audio.state !== 'running') throw new Error('The browser paused audio. Tap Hands-free to try again.')

      const analyser = audio.createAnalyser()
      analyser.fftSize = 1024
      audio.createMediaStreamSource(stream).connect(analyser)
      const tracks = stream.getAudioTracks()
      const onMicLost = () => {
        setError('The microphone disconnected. Tap Hands-free to try again.')
        stop()
      }
      tracks.forEach((track) => track.addEventListener('ended', onMicLost, { once: true }))
      signal.addEventListener('abort', () =>
        tracks.forEach((track) => track.removeEventListener('ended', onMicLost)), { once: true })

      if (handlers.current.onStart) {
        tracks.forEach((track) => { track.enabled = false })
        setStatus('Responding…')
        await handlers.current.onStart(signal)
      }
      while (!signal.aborted) {
        tracks.forEach((track) => { track.enabled = true })
        setStatus('Listening…')
        const turn = await recordSpokenTurn(stream, analyser, signal)
        if (!turn || signal.aborted) continue
        tracks.forEach((track) => { track.enabled = false })
        setStatus('Transcribing…')
        const text = (await transcribe(turn.audio, turn.mime, loadSettings(), signal)).trim()
        if (signal.aborted || !text) continue
        if (voiceReviewCommand(text) === 'pause') {
          stop()
          break
        }
        setStatus('Responding…')
        await handlers.current.onTurn(text, signal)
      }
    } catch (reason) {
      if (!signal.aborted) {
        setError(reason instanceof DOMException && reason.name === 'NotAllowedError'
          ? 'Microphone permission was denied. Allow access and try again.'
          : reason instanceof Error ? reason.message : String(reason))
        stop()
      }
    }
  }

  return { status, error, start, stop }
}

export function handsFreeUnavailableReason(recordingReason: string | null, configured: boolean) {
  if (!configured) return 'Set up AI to use hands-free voice.'
  if (recordingReason) return recordingReason
  if (typeof AudioContext === 'undefined') return 'This browser cannot detect pauses. Use manual recording.'
  return null
}
