import { useEffect, useRef, useState } from 'react'
import { liveQuery } from './db'

/**
 * React binding for Dexie's liveQuery: re-runs the querier whenever any
 * table it touched changes, so every view re-renders (and re-ranks) live on
 * any mutation. Returns undefined until the first result arrives.
 */
export function useLiveQuery<T>(querier: () => T | Promise<T>, deps: readonly unknown[]): T | undefined {
  const querierRef = useRef(querier)
  querierRef.current = querier
  const [value, setValue] = useState<T>()
  useEffect(() => {
    const subscription = liveQuery(() => querierRef.current()).subscribe({
      next: (result) => setValue(result),
      error: () => setValue(undefined),
    })
    return () => subscription.unsubscribe()
    // deps are the query identity; the querier itself is read through a ref
  }, deps)
  return value
}
