import { useState } from 'react'
import DecisionView from './ui/DecisionView'
import Home from './ui/Home'

export default function App() {
  const [decisionId, setDecisionId] = useState<string | null>(null)
  return (
    <div className="min-h-dvh bg-slate-50 text-slate-900">
      {decisionId === null ? (
        <Home onOpen={setDecisionId} />
      ) : (
        <DecisionView key={decisionId} id={decisionId} onBack={() => setDecisionId(null)} />
      )}
    </div>
  )
}
