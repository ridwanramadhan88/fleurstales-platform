import { useCallback, useEffect, useRef, useState } from 'react'
import {
  getGoogleMapsBrowserKey,
  newPlaceSessionToken,
  resolvePlace,
  searchPlaces,
  type PlaceSuggestion,
  type ResolvedPlace,
} from '../lib/googlePlaces'

/**
 * Debounced Google address search. `available` is false without a browser
 * key, so callers can hide the field. A session token is reused until a
 * place is chosen, then renewed.
 */
export const usePlaceSearch = (center?: { latitude: number; longitude: number }) => {
  const key = getGoogleMapsBrowserKey()
  const [query, setQuery] = useState('')
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([])
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle')
  const token = useRef(newPlaceSessionToken())
  const centerRef = useRef(center)
  centerRef.current = center

  useEffect(() => {
    if (!key || query.trim().length < 3) { setSuggestions([]); setStatus('idle'); return }
    const controller = new AbortController()
    setStatus('loading')
    const timer = window.setTimeout(() => {
      searchPlaces(query, { key, sessionToken: token.current, center: centerRef.current, signal: controller.signal })
        .then((items) => { setSuggestions(items); setStatus('idle') })
        .catch((error: unknown) => {
          if (error instanceof DOMException && error.name === 'AbortError') return
          setSuggestions([]); setStatus('error')
        })
    }, 300)
    return () => { window.clearTimeout(timer); controller.abort() }
  }, [key, query])

  const choose = useCallback(async (placeId: string): Promise<ResolvedPlace | null> => {
    try {
      const place = await resolvePlace(placeId, { key, sessionToken: token.current })
      token.current = newPlaceSessionToken()
      setSuggestions([])
      return place
    } catch {
      setStatus('error')
      return null
    }
  }, [key])

  return { available: key !== '', query, setQuery, suggestions, status, choose, clear: () => { setQuery(''); setSuggestions([]) } }
}
