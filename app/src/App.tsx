import { useState } from 'react'
import DecisionView from './ui/DecisionView'
import Home from './ui/Home'

export default function App() {
  const [decisionId, setDecisionId] = useState<string | null>(null)
  return (
    <div className="app-bg min-h-dvh text-ink">
      {decisionId === null ? (
        <Home onOpen={setDecisionId} />
      ) : (
        <DecisionView key={decisionId} id={decisionId} onBack={() => setDecisionId(null)} />
      )}
    </div>
  )
}
