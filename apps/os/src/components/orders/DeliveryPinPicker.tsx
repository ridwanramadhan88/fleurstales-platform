import { useEffect, useRef, useState, type FC } from 'react'
import { ExternalLink, LocateFixed, MapPin, X } from 'lucide-react'
import { useBilingualCopy } from '../../i18n/bilingualCopy'
import { usePlaceSearch } from '../../hooks/usePlaceSearch'
import { createGoogleMapPin, type PinMapHandle } from '../../lib/googleMapPin'
import {
  formatDeliveryPin,
  googleMapsUrlForPin,
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
interface LeafletLike {
  map: (element: HTMLElement, options?: Record<string, unknown>) => LeafletMap
  tileLayer: (url: string, options?: Record<string, unknown>) => { addTo: (map: LeafletMap) => unknown }
  marker: (point: [number, number], options?: Record<string, unknown>) => LeafletMarker
  divIcon: (options?: Record<string, unknown>) => unknown
}

const TILES = 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png'
const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
const FALLBACK_CENTER: DeliveryPin = { latitude: -5.4294, longitude: 105.261 }

interface Props {
  id?: string
  value: DeliveryPin | null
  onChange: (pin: DeliveryPin | null) => void
  center?: DeliveryPin
  invalid?: boolean
  /** Called with the street address of a searched place (to prefill an empty address). */
  onAddressPicked?: (address: string) => void
}

/**
 * Delivery pin for Admin: paste the location the customer shared on WhatsApp,
 * or tap / drag on the map (Google Maps when the browser key is set, otherwise Leaflet from index.html).
 */
export const DeliveryPinPicker: FC<Props> = ({ id, value, onChange, center, invalid, onAddressPicked }) => {
  const copy = useBilingualCopy()
  const places = usePlaceSearch(center)
  const mapElement = useRef<HTMLDivElement>(null)
  const mapRef = useRef<LeafletMap | null>(null)
  const markerRef = useRef<LeafletMarker | null>(null)
  const leafletRef = useRef<LeafletLike | null>(null)
  const googleRef = useRef<PinMapHandle | null>(null)
  const onChangeRef = useRef(onChange)
  const [mapReady, setMapReady] = useState(false)
  const [pasted, setPasted] = useState('')
  const [message, setMessage] = useState<string | null>(null)

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
      className: 'fleurstales-map-pin-shell',
      html: '<div class="fleurstales-map-pin"><span></span></div>',
      iconSize: [38, 46],
      iconAnchor: [19, 42],
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
    const element = mapElement.current
    if (!element) return
    let cancelled = false
    let stopLeaflet: (() => void) | undefined

    const startLeaflet = (): (() => void) | undefined => {
      const L = (window as unknown as { L?: LeafletLike }).L
      if (!L) return undefined
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
      setMapReady(true)
      const timer = window.setTimeout(() => map.invalidateSize(), 80)
      return () => {
        window.clearTimeout(timer)
        map.remove()
        mapRef.current = null
        markerRef.current = null
      }
    }

    void createGoogleMapPin(element, {
      start: value ?? center ?? FALLBACK_CENTER,
      zoom: value ? 17 : 14,
      pin: value,
      onPick: (point) => { const next = toDeliveryPin(point.latitude, point.longitude); if (next) onChangeRef.current(next) },
      onFailure: () => {
        googleRef.current?.destroy()
        googleRef.current = null
        if (!cancelled) stopLeaflet = startLeaflet()
      },
    }).then((handle) => {
      if (cancelled) { handle?.destroy(); return }
      if (handle) {
        googleRef.current = handle
        setMapReady(true)
        window.setTimeout(() => handle.refresh(), 80)
      } else {
        stopLeaflet = startLeaflet()
      }
    })

    return () => {
      cancelled = true
      googleRef.current?.destroy()
      googleRef.current = null
      stopLeaflet?.()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (googleRef.current) {
      googleRef.current.setPin(value)
      return
    }
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
    if (!text.trim()) { setMessage(null); return }
    const pin = parseMapsLocation(text)
    if (pin) {
      onChange(pin)
      setMessage(null)
      return
    }
    setMessage(isShortMapsLink(text)
      ? copy('Short links have no coordinates. Open the link, then copy the full link from the address bar.', 'Link pendek tidak berisi koordinat. Buka link-nya, lalu salin link lengkap dari bilah alamat.')
      : copy('No coordinates found in this text.', 'Tidak ada koordinat di teks ini.'))
  }

  const pickPlace = async (placeId: string) => {
    const place = await places.choose(placeId)
    if (!place) { setMessage(copy('Could not load that place. Tap the map instead.', 'Tempat itu tidak bisa dimuat. Ketuk peta saja.')); return }
    const pin = toDeliveryPin(place.latitude, place.longitude)
    if (pin) onChange(pin)
    if (place.address) onAddressPicked?.(place.address)
    places.clear()
    setMessage(null)
  }

  return (
    <div className="space-y-2">
      {places.available && (
        <div className="relative">
          <input
            value={places.query}
            onChange={(event) => places.setQuery(event.target.value)}
            placeholder={copy('Search address or place', 'Cari alamat atau tempat')}
            aria-label={copy('Search address or place', 'Cari alamat atau tempat')}
            autoComplete="off"
            className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
          {places.suggestions.length > 0 && (
            <ul role="listbox" className="absolute inset-x-0 top-full z-[600] mt-1 max-h-64 overflow-y-auto rounded-xl bg-background py-1 shadow-ios-sm ring-1 ring-border/60">
              {places.suggestions.map((item) => (
                <li key={item.placeId} role="option" aria-selected={false}>
                  <button type="button" onClick={() => void pickPlace(item.placeId)} className="block w-full px-3 py-2 text-left hover:bg-muted">
                    <span className="block text-sm font-medium text-foreground">{item.title}</span>
                    {item.subtitle && <span className="block text-xs text-muted-foreground">{item.subtitle}</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {places.status === 'error' && <p className="mt-1 text-xs text-muted-foreground">{copy('Address search is unavailable. Tap the map or paste a link.', 'Pencarian alamat tidak tersedia. Ketuk peta atau tempel link.')}</p>}
        </div>
      )}
      <input
        id={id}
        value={pasted}
        onChange={(event) => applyPasted(event.target.value)}
        inputMode="url"
        placeholder={copy('Paste the Google Maps link or "lat, lng"', 'Tempel link Google Maps atau "lat, lng"')}
        aria-label={copy('Delivery pin: Google Maps link or coordinates', 'Pin antar: link Google Maps atau koordinat')}
        aria-invalid={invalid || undefined}
        className={`h-11 w-full rounded-xl border bg-background px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 ${invalid ? 'border-destructive ring-destructive/25' : 'border-border'}`}
      />
      {message && <p className="text-xs text-destructive" role="alert">{message}</p>}
      <div className="relative overflow-hidden rounded-xl ring-1 ring-border/60">
        <div
          ref={mapElement}
          className={`h-48 w-full bg-muted ${mapReady ? '' : 'hidden'}`}
          role="application"
          aria-label={copy('Map. Tap to place the pin, drag it to adjust.', 'Peta. Ketuk untuk menaruh pin, geser untuk menyesuaikan.')}
        />
        {!mapReady && (
          <p className="px-3 py-3 text-xs text-muted-foreground">
            {copy('Map unavailable. Paste the link above.', 'Peta tidak tersedia. Tempel link di atas.')}
          </p>
        )}
        {mapReady && 'geolocation' in navigator && (
          <button
            type="button"
            onClick={() => navigator.geolocation.getCurrentPosition((position) => {
              const pin = toDeliveryPin(position.coords.latitude, position.coords.longitude)
              if (pin) onChange(pin)
            })}
            aria-label={copy('Use my location', 'Pakai lokasi saya')}
            className="absolute right-2 top-2 z-[500] grid size-10 place-items-center rounded-full bg-background shadow-ios-sm"
          >
            <LocateFixed className="size-4" />
          </button>
        )}
      </div>
      {value && (
        <div className="flex items-center gap-2 text-sm text-foreground">
          <MapPin className="size-4 shrink-0 text-primary" />
          <span className="min-w-0 flex-1 truncate">{copy('Pin set', 'Pin terpasang')} · {formatDeliveryPin(value)}</span>
          <a
            href={googleMapsUrlForPin(value)}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-9 items-center gap-1 rounded-full px-2 text-xs font-semibold text-primary hover:bg-primary/10"
          >
            Maps <ExternalLink className="size-3.5" />
          </a>
          <button
            type="button"
            onClick={() => { onChange(null); setPasted('') }}
            aria-label={copy('Remove pin', 'Hapus pin')}
            className="grid size-9 place-items-center rounded-full text-muted-foreground hover:bg-muted"
          >
            <X className="size-4" />
          </button>
        </div>
      )}
    </div>
  )
}
