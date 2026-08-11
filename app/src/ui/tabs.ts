// Tab definitions shared by the decision view and the chat sheet (the sheet
// shows the active tab as its context chip).

export type Tab = 'dimensions' | 'options' | 'score' | 'results'

export const TABS: { id: Tab; label: string }[] = [
  { id: 'dimensions', label: 'Dimensions' },
  { id: 'options', label: 'Options' },
  { id: 'score', label: 'Score' },
  { id: 'results', label: 'Results' },
]
