import type { useHandsFree } from './useHandsFree'

export default function HandsFreeControls({
  session,
  unavailable,
  busy,
}: {
  session: ReturnType<typeof useHandsFree>
  unavailable: string | null
  busy: boolean
}) {
  return (
    <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1">
      <button
        type="button"
        disabled={session.status === null && (busy || !!unavailable)}
        className={session.status ? 'secondary-action' : 'text-action'}
        onClick={session.status ? session.stop : () => void session.start()}
      >
        {session.status ? 'Pause hands-free' : 'Hands-free'}
      </button>
      <p role="status" className="min-w-0 flex-1 basis-36 text-sm leading-snug text-ink-2">
        {session.status === 'Listening…'
          ? 'Listening… Say “pause listening” to stop.'
          : session.status ?? (session.error || unavailable || 'Talk, then pause to send.')}
      </p>
    </div>
  )
}
