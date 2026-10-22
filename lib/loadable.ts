import {type DependencyList, useEffect, useState} from 'react'

export type Loadable<T> = {status: 'loading'} | {status: 'error'; message: string} | {status: 'ready'; data: T}

export function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** As `@s` has it. The last result stays on screen until the next one lands. */
export function useLoadable<T>(load: () => Promise<T>, deps: DependencyList): Loadable<T> {
  const [state, setState] = useState<Loadable<T>>({status: 'loading'})

  useEffect(() => {
    let cancelled = false
    load().then(
      (data) => {
        if (!cancelled) setState({status: 'ready', data})
      },
      (error: unknown) => {
        if (!cancelled) setState({status: 'error', message: messageOf(error)})
      },
    )
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the caller's deps
  }, deps)

  return state
}

/**
 * One request for a short while: every picked item renders a preview that
 * needs the listing, and so does the picker. Unlike `@s`, it goes stale,
 * because teams build Knowledge Bases and merge tools during the day and pick
 * them minutes later. A failed request is dropped, so the next render asks again.
 */
export function cachedFor<Args extends unknown[], T>(ms: number, load: (...args: Args) => Promise<T>): (...args: Args) => Promise<T> {
  let kept: {at: number; listing: Promise<T>} | undefined
  return (...args) => {
    if (kept && Date.now() - kept.at < ms) return kept.listing
    const listing = load(...args)
    kept = {at: Date.now(), listing}
    listing.catch(() => {
      if (kept?.listing === listing) kept = undefined
    })
    return listing
  }
}
