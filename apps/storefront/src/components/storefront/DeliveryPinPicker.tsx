import { useEffect, useRef, useState, type FC } from 'react'
import { LocateFixed, MapPin, X } from 'lucide-react'
import {
  formatDeliveryPin,
  isShortMapsLink,
  parseMapsLocation,
  toDeliveryPin,
  type DeliveryPin,
} from '../../domain/deliveryDetailsDomain'

interface LeafletLatLng { lat: number; lng: number }
interface LeafletMap {
  setView: (center: [number, number], zoom: number) => LeafletMap
  on: (event: string, handler: (event: { latlng: LeafletLatLng }) => void) => LeafletMap
  remove: () => void
  invalidateSize: () => void
}
interface LeafletMarker {
  addTo: (map: LeafletMap) => LeafletMarker
  setLatLng: (point: [number, number]) => LeafletMarker
  on: (event: string, handler: (event: { target: { getLatLng: () => LeafletLatLng } }) => void) => LeafletMarker
  remove: () => void
}
interface LeafletGlobal {
  map: (element: HTMLElement, options?: Record<string, unknown>) => LeafletMap
  tileLayer: (url: string, options?: Record<string, unknown>) => { addTo: (map: LeafletMap) => unknown }
  marker: (point: [number, number], options?: Record<string, unknown>) => LeafletMarker
  divIcon: (options?: Record<string, unknown>) => unknown
}

const LEAFLET_JS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
const LEAFLET_CSS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
const TILES = 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png'
const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
/** Bandar Lampung, used when the branch has no saved location. */
const FALLBACK_CENTER: DeliveryPin = { latitude: -5.4294, longitude: 105.261 }

let leafletLoading: Promise<LeafletGlobal | null> | null = null

const loadLeaflet = (): Promise<LeafletGlobal | null> => {
  const existing = (window as unknown as { L?: LeafletGlobal }).L
  if (existing) return Promise.resolve(existing)
  if (leafletLoading) return leafletLoading
  leafletLoading = new Promise((resolve) => {
    if (!document.querySelector(`link[href="${LEAFLET_CSS}"]`)) {
      const css = document.createElement('link')
      css.rel = 'stylesheet'
      css.href = LEAFLET_CSS
      document.head.appendChild(css)
    }
    const script = document.createElement('script')
    script.src = LEAFLET_JS
    script.async = true
    script.onload = () => resolve((window as unknown as { L?: LeafletGlobal }).L ?? null)
    script.onerror = () => { leafletLoading = null; resolve(null) }
    document.head.appendChild(script)
  })
  return leafletLoading
}

interface Props {
  value: DeliveryPin | null
  onChange: (pin: DeliveryPin | null) => void
  /** Branch location: where the map opens. */
  center?: DeliveryPin
}

/**
 * Pin the delivery address on a map: tap or drag the pin, use the phone's
 * location, or paste a Google Maps link. The paste field also works when the
 * map cannot load.
 */
export const DeliveryPinPicker: FC<Props> = ({ value, onChange, center }) => {
  const mapElement = useRef<HTMLDivElement>(null)
  const mapRef = useRef<LeafletMap | null>(null)
  const markerRef = useRef<LeafletMarker | null>(null)
  const leafletRef = useRef<LeafletGlobal | null>(null)
  const onChangeRef = useRef(onChange)
  const [mapState, setMapState] = useState<'loading' | 'ready' | 'unavailable'>('loading')
  const [pasted, setPasted] = useState('')
  const [pasteMessage, setPasteMessage] = useState<string | null>(null)
  const [locating, setLocating] = useState(false)

  useEffect(() => { onChangeRef.current = onChange }, [onChange])

  const placeMarker = (pin: DeliveryPin) => {
    const L = leafletRef.current
    const map = mapRef.current
    if (!L || !map) return
    if (markerRef.current) {
      markerRef.current.setLatLng([pin.latitude, pin.longitude])
      return
    }
    const icon = L.divIcon({
      className: 'fleurstales-delivery-pin-shell',
      html: '<svg width="32" height="42" viewBox="0 0 32 42" aria-hidden="true"><path d="M16 41S30 26 30 15A14 14 0 002 15c0 11 14 26 14 26z" fill="#00813F"/><circle cx="16" cy="15" r="5.5" fill="#fff"/></svg>',
      iconSize: [32, 42],
      iconAnchor: [16, 41],
    })
    markerRef.current = L.marker([pin.latitude, pin.longitude], { draggable: true, icon, keyboard: true, autoPan: true })
      .addTo(map)
      .on('dragend', (event) => {
        const point = event.target.getLatLng()
        const next = toDeliveryPin(point.lat, point.lng)
        if (next) onChangeRef.current(next)
      })
  }

  useEffect(() => {
    let cancelled = false
    void loadLeaflet().then((L) => {
      if (cancelled) return
      const element = mapElement.current
      if (!L || !element) { setMapState('unavailable'); return }
      leafletRef.current = L
      const start = value ?? center ?? FALLBACK_CENTER
      const map = L.map(element, { zoomControl: true, attributionControl: true, scrollWheelZoom: false })
        .setView([start.latitude, start.longitude], value ? 17 : 14)
      L.tileLayer(TILES, { maxZoom: 20, subdomains: 'abcd', attribution: ATTRIBUTION }).addTo(map)
      map.on('click', (event) => {
        const next = toDeliveryPin(event.latlng.lat, event.latlng.lng)
        if (next) onChangeRef.current(next)
      })
      mapRef.current = map
      if (value) placeMarker(value)
      setMapState('ready')
      window.setTimeout(() => map.invalidateSize(), 80)
    })
    return () => {
      cancelled = true
      mapRef.current?.remove()
      mapRef.current = null
      markerRef.current = null
    }
    // The map is created once; pin updates are applied below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!value) {
      markerRef.current?.remove()
      markerRef.current = null
      return
    }
    placeMarker(value)
    mapRef.current?.setView([value.latitude, value.longitude], 17)
  }, [value?.latitude, value?.longitude]) // eslint-disable-line react-hooks/exhaustive-deps

  const applyPasted = (text: string) => {
    setPasted(text)
    if (!text.trim()) { setPasteMessage(null); return }
    const pin = parseMapsLocation(text)
    if (pin) {
      onChange(pin)
      setPasteMessage(null)
      return
    }
    setPasteMessage(isShortMapsLink(text)
      ? 'Short links have no coordinates. Open the link, then copy the full address bar link.'
      : 'No coordinates found in this text.')
  }

  const useMyLocation = () => {
    if (!navigator.geolocation) { setPasteMessage('Location is not available on this device.'); return }
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocating(false)
        const pin = toDeliveryPin(position.coords.latitude, position.coords.longitude)
        if (pin) onChange(pin)
      },
      () => { setLocating(false); setPasteMessage('Location permission was not granted.') },
      { enableHighAccuracy: true, timeout: 10_000 },
    )
  }

  return (
    <div className="grid gap-2.5">
      <div className="relative overflow-hidden rounded-[var(--sf-radius-card)] bg-[#ECEBE6]">
        <div
          ref={mapElement}
          className="h-[13.5rem] w-full"
          role="application"
          aria-label="Delivery map. Tap to place the pin, drag it to adjust."
        />
        {mapState !== 'ready' && (
          <div className="absolute inset-0 grid place-items-center px-6 text-center sf-type-1 text-black/55">
            {mapState === 'loading' ? 'Loading map…' : 'The map could not load. Paste a Google Maps link below.'}
          </div>
        )}
        {mapState === 'ready' && !value && (
          <span className="pointer-events-none absolute bottom-3 left-3 rounded-full bg-white/95 px-3 py-1.5 sf-type-1">
            Tap the map where the recipient is
          </span>
        )}
        <button
          type="button"
          onClick={useMyLocation}
          aria-label="Use my location"
          className="absolute right-3 top-3 z-[500] grid size-11 place-items-center rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,0.18)]"
        >
          <LocateFixed className={`size-[1.1rem] ${locating ? 'animate-pulse' : ''}`} strokeWidth={1.7} />
        </button>
      </div>

      {value ? (
        <div className="flex items-center gap-2 sf-type-2 text-[#006f36]">
          <MapPin className="size-4 shrink-0" strokeWidth={1.7} />
          <span className="min-w-0 flex-1 truncate"><span>Pin set</span> · <span>{formatDeliveryPin(value)}</span></span>
          <button
            type="button"
            onClick={() => { onChange(null); setPasted('') }}
            aria-label="Remove pin"
            className="grid size-9 place-items-center rounded-full text-black/55 hover:bg-black/5"
          >
            <X className="size-4" />
          </button>
        </div>
      ) : null}

      <input
        value={pasted}
        onChange={(event) => applyPasted(event.target.value)}
        inputMode="url"
        placeholder="Or paste a Google Maps link"
        aria-label="Google Maps link or coordinates"
        className="sf-field"
      />
      {pasteMessage && <p className="sf-type-1 text-[#8a1c14]">{pasteMessage}</p>}
    </div>
  )
}
