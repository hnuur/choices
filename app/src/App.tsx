import { useState } from 'react'
import DecisionView from './ui/DecisionView'
import Home from './ui/Home'
import type { Tab } from './ui/tabs'

export default function App() {
  const [open, setOpen] = useState<{ id: string; tab: Tab } | null>(null)
  return (
    <div className="app-bg min-h-dvh text-ink">
      {open === null ? (
        <Home onOpen={(id, tab) => setOpen({ id, tab })} />
      ) : (
        <DecisionView
          key={open.id}
          id={open.id}
          initialTab={open.tab}
          onBack={() => setOpen(null)}
        />
      )}
    </div>
  )
}
