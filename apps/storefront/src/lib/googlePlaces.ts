/**
 * Google Places (New) address search for the delivery pin.
 *
 * Uses the REST API with the browser key (restricted to the shop and Admin
 * domains and to the Places API), so no Google script is loaded and the
 * existing map keeps working. One autocomplete session ends with one place
 * lookup, which is how Google bills it. Without a key everything here is
 * inert and the pin picker falls back to tap / paste.
 */

export interface PlaceSuggestion {
  placeId: string
  title: string
  subtitle: string
}

export interface ResolvedPlace {
  latitude: number
  longitude: number
  address: string
}

interface BiasCenter { latitude: number; longitude: number }

const AUTOCOMPLETE_URL = 'https://places.googleapis.com/v1/places:autocomplete'
const PLACE_URL = 'https://places.googleapis.com/v1/places'

export const getGoogleMapsBrowserKey = (): string => {
  const config = (globalThis as typeof globalThis & { __FLEURSTALES_CONFIG__?: { googleMapsBrowserKey?: string } }).__FLEURSTALES_CONFIG__
  return (config?.googleMapsBrowserKey ?? '').trim()
}

export const newPlaceSessionToken = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`

interface PredictionResponse {
  suggestions?: Array<{
    placePrediction?: {
      placeId?: string
      text?: { text?: string }
      structuredFormat?: { mainText?: { text?: string }; secondaryText?: { text?: string } }
    }
  }>
}

export const searchPlaces = async (
  query: string,
  options: { key: string; sessionToken: string; center?: BiasCenter; signal?: AbortSignal },
): Promise<PlaceSuggestion[]> => {
  const input = query.trim()
  if (input.length < 3 || !options.key) return []
  const response = await fetch(AUTOCOMPLETE_URL, {
    method: 'POST',
    signal: options.signal,
    headers: {
      'content-type': 'application/json',
      'x-goog-api-key': options.key,
      'x-goog-fieldmask': 'suggestions.placePrediction.placeId,suggestions.placePrediction.text,suggestions.placePrediction.structuredFormat',
    },
    body: JSON.stringify({
      input,
      sessionToken: options.sessionToken,
      languageCode: 'id',
      includedRegionCodes: ['id'],
      ...(options.center
        ? { locationBias: { circle: { center: { latitude: options.center.latitude, longitude: options.center.longitude }, radius: 50_000 } } }
        : {}),
    }),
  })
  if (!response.ok) throw new Error(`PLACES_${response.status}`)
  const data = await response.json() as PredictionResponse
  return (data.suggestions ?? []).flatMap((item) => {
    const prediction = item.placePrediction
    if (!prediction?.placeId) return []
    const title = prediction.structuredFormat?.mainText?.text ?? prediction.text?.text ?? ''
    if (!title) return []
    return [{ placeId: prediction.placeId, title, subtitle: prediction.structuredFormat?.secondaryText?.text ?? '' }]
  })
}

export const resolvePlace = async (
  placeId: string,
  options: { key: string; sessionToken: string; signal?: AbortSignal },
): Promise<ResolvedPlace | null> => {
  const url = `${PLACE_URL}/${encodeURIComponent(placeId)}?sessionToken=${encodeURIComponent(options.sessionToken)}&languageCode=id`
  const response = await fetch(url, {
    signal: options.signal,
    headers: { 'x-goog-api-key': options.key, 'x-goog-fieldmask': 'location,formattedAddress' },
  })
  if (!response.ok) throw new Error(`PLACES_${response.status}`)
  const data = await response.json() as { location?: { latitude?: number; longitude?: number }; formattedAddress?: string }
  const { latitude, longitude } = data.location ?? {}
  if (typeof latitude !== 'number' || typeof longitude !== 'number') return null
  return { latitude, longitude, address: data.formattedAddress ?? '' }
}
