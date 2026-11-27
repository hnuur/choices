import { lazy, Suspense } from 'react'

const Markdown = lazy(() => import('react-markdown'))

export default function ConversationMessage({
  text,
  kind,
  label,
}: {
  text: string
  kind: 'user' | 'assistant' | 'error'
  label?: string
}) {
  const tone = {
    user: 'ml-auto w-fit bg-accent text-on-accent',
    assistant: 'mr-auto w-fit bg-surface text-ink',
    error: 'border border-red-400/30 bg-red-400/10 text-red-200',
  }[kind]

  return (
    <div className={`conversation-message rounded-xl px-3.5 py-2.5 text-base leading-relaxed sm:px-4 ${tone}`}>
      {label && <p className="mb-1 text-sm font-semibold">{label}</p>}
      {kind === 'assistant' ? (
        <Suspense fallback={<p>{text}</p>}>
          <Markdown skipHtml disallowedElements={['img']} unwrapDisallowed>{text}</Markdown>
        </Suspense>
      ) : <p>{text}</p>}
    </div>
  )
}
