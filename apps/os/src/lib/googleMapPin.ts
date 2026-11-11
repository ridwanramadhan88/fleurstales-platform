/**
 * Google Maps (JavaScript API) map for the delivery pin picker.
 *
 * Loaded on demand with the browser key (restricted to the shop and Admin
 * domains). Without a key, or if the script cannot load or the key is
 * rejected, this returns null / calls onFailure and the picker falls back to
 * the Leaflet map, so the pin can always be set.
 */

import { getGoogleMapsBrowserKey } from './googlePlaces'

export interface MapPoint { latitude: number; longitude: number }

export interface PinMapHandle {
  /** Moves (or removes, with null) the pin and recenters on it. */
  setPin: (pin: MapPoint | null) => void
  /** Call after the container becomes visible. */
  refresh: () => void
  destroy: () => void
}

interface GLatLng { lat: () => number; lng: () => number }
interface GMapMouseEvent { latLng?: GLatLng | null }
interface GMarker {
  setPosition: (point: { lat: number; lng: number }) => void
  setMap: (map: unknown | null) => void
  addListener: (event: string, handler: (event: GMapMouseEvent) => void) => void
}
interface GMap {
  setCenter: (point: { lat: number; lng: number }) => void
  setZoom: (zoom: number) => void
  addListener: (event: string, handler: (event: GMapMouseEvent) => void) => void
}
interface GoogleMapsApi {
  importLibrary: (name: 'maps' | 'marker') => Promise<Record<string, unknown>>
  event: { trigger: (instance: unknown, event: string) => void }
}

declare global {
  interface Window {
    google?: { maps?: GoogleMapsApi }
    gm_authFailure?: () => void
  }
}

let loading: Promise<GoogleMapsApi | null> | null = null

export const loadGoogleMaps = (key: string): Promise<GoogleMapsApi | null> => {
  if (window.google?.maps?.importLibrary) return Promise.resolve(window.google.maps)
  if (loading) return loading
  loading = new Promise((resolve) => {
    const script = document.createElement('script')
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&v=weekly&loading=async&language=id&region=ID`
    script.async = true
    script.onload = () => resolve(window.google?.maps?.importLibrary ? window.google.maps : null)
    script.onerror = () => { loading = null; script.remove(); resolve(null) }
    document.head.appendChild(script)
  })
  return loading
}

interface Options {
  start: MapPoint
  zoom: number
  pin: MapPoint | null
  onPick: (point: MapPoint) => void
  /** The key was rejected after the map was shown (referrer / API not allowed). */
  onFailure: () => void
}

export const createGoogleMapPin = async (element: HTMLElement, options: Options): Promise<PinMapHandle | null> => {
  const key = getGoogleMapsBrowserKey()
  if (!key) return null
  const api = await loadGoogleMaps(key)
  if (!api) return null

  let destroyed = false
  window.gm_authFailure = () => { if (!destroyed) options.onFailure() }

  let mapsLib: Record<string, unknown>
  let markerLib: Record<string, unknown>
  try {
    mapsLib = await api.importLibrary('maps')
    markerLib = await api.importLibrary('marker')
  } catch {
    return null
  }
  const MapCtor = mapsLib.Map as new (el: HTMLElement, opts: Record<string, unknown>) => GMap
  const MarkerCtor = markerLib.Marker as new (opts: Record<string, unknown>) => GMarker

  const map = new MapCtor(element, {
    center: { lat: options.start.latitude, lng: options.start.longitude },
    zoom: options.zoom,
    gestureHandling: 'cooperative',
    clickableIcons: false,
    mapTypeControl: false,
    streetViewControl: false,
    fullscreenControl: false,
  })

  let marker: GMarker | null = null
  const toPoint = (latLng?: GLatLng | null): MapPoint | null => (latLng ? { latitude: latLng.lat(), longitude: latLng.lng() } : null)

  const place = (pin: MapPoint) => {
    const position = { lat: pin.latitude, lng: pin.longitude }
    if (marker) { marker.setPosition(position); return }
    marker = new MarkerCtor({ position, map, draggable: true })
    marker.addListener('dragend', (event) => {
      const point = toPoint(event.latLng)
      if (point) options.onPick(point)
    })
  }

  map.addListener('click', (event) => {
    const point = toPoint(event.latLng)
    if (point) options.onPick(point)
  })
  if (options.pin) place(options.pin)

  return {
    setPin: (pin) => {
      if (!pin) { marker?.setMap(null); marker = null; return }
      place(pin)
      map.setCenter({ lat: pin.latitude, lng: pin.longitude })
      map.setZoom(17)
    },
    refresh: () => api.event.trigger(map, 'resize'),
    destroy: () => {
      destroyed = true
      marker?.setMap(null)
      marker = null
      element.innerHTML = ''
    },
  }
}
