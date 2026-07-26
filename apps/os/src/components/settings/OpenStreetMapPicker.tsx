import { useEffect, useRef, useState, type FC } from 'react'
import { ExternalLink, LocateFixed, MapPin, MousePointer2 } from 'lucide-react'

interface GeoPoint {
  latitude: number
  longitude: number
}

interface LeafletLatLng {
  lat: number
  lng: number
}

interface LeafletMapEvent {
  latlng: LeafletLatLng
}

interface LeafletDragEventTarget {
  getLatLng: () => LeafletLatLng
}

interface LeafletDragEvent {
  target: LeafletDragEventTarget
}

interface LeafletMapLike {
  setView: (center: [number, number], zoom: number, options?: Record<string, unknown>) => LeafletMapLike
  flyTo: (center: [number, number], zoom?: number, options?: Record<string, unknown>) => LeafletMapLike
  getZoom: () => number
  on: (eventName: string, handler: (event: LeafletMapEvent) => void) => LeafletMapLike
  remove: () => void
  invalidateSize: (options?: Record<string, unknown>) => void
}

interface LeafletMarkerLike {
  addTo: (map: LeafletMapLike) => LeafletMarkerLike
  on: (eventName: string, handler: (event: LeafletDragEvent) => void) => LeafletMarkerLike
  setLatLng: (center: [number, number]) => LeafletMarkerLike
  dragging?: { enable: () => void; disable: () => void }
}

interface LeafletCircleLike {
  addTo: (map: LeafletMapLike) => LeafletCircleLike
  setLatLng: (center: [number, number]) => LeafletCircleLike
  setRadius: (radius: number) => LeafletCircleLike
}

interface LeafletGlobal {
  map: (element: HTMLElement, options?: Record<string, unknown>) => LeafletMapLike
  tileLayer: (url: string, options?: Record<string, unknown>) => { addTo: (map: LeafletMapLike) => unknown }
  marker: (center: [number, number], options?: Record<string, unknown>) => LeafletMarkerLike
  circle: (center: [number, number], options?: Record<string, unknown>) => LeafletCircleLike
  divIcon: (options?: Record<string, unknown>) => unknown
  control: { zoom: (options?: Record<string, unknown>) => { addTo: (map: LeafletMapLike) => unknown } }
}

declare global {
  interface Window {
    L?: LeafletGlobal
  }
}

interface Props {
  branchName: string
  location: GeoPoint
  radiusMeters: number
  isEditing: boolean
  onLocationChange: (location: GeoPoint) => void
}

const DEFAULT_ZOOM = 18
const VOYAGER_TILES = 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png'
const MAP_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'

const cssColor = (name: string, fallback: string): string => {
  if (typeof window === 'undefined') return fallback
  const raw = window.getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return raw ? `hsl(${raw})` : fallback
}

const pointTuple = (location: GeoPoint): [number, number] => [location.latitude, location.longitude]

export const OpenStreetMapPicker: FC<Props> = ({
  branchName,
  location,
  radiusMeters,
  isEditing,
  onLocationChange,
}) => {
  const mapElementRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<LeafletMapLike | null>(null)
  const markerRef = useRef<LeafletMarkerLike | null>(null)
  const radiusRef = useRef<LeafletCircleLike | null>(null)
  const onLocationChangeRef = useRef(onLocationChange)
  const editingRef = useRef(isEditing)
  const [mapAvailable, setMapAvailable] = useState(true)
  const [locating, setLocating] = useState(false)
  const [locationError, setLocationError] = useState<string | null>(null)

  useEffect(() => {
    onLocationChangeRef.current = onLocationChange
  }, [onLocationChange])

  useEffect(() => {
    editingRef.current = isEditing
    if (isEditing) markerRef.current?.dragging?.enable()
    else markerRef.current?.dragging?.disable()
  }, [isEditing])

  useEffect(() => {
    const L = window.L
    const element = mapElementRef.current
    if (!L || !element) {
      setMapAvailable(false)
      return
    }

    const primary = cssColor('--primary', '#315e4c')
    const map = L.map(element, {
      zoomControl: false,
      attributionControl: true,
      scrollWheelZoom: true,
      touchZoom: true,
      doubleClickZoom: true,
      inertia: true,
      easeLinearity: 0.25,
      zoomSnap: 0.5,
      zoomDelta: 0.5,
      wheelPxPerZoomLevel: 90,
      zoomAnimation: true,
      fadeAnimation: true,
      markerZoomAnimation: true,
      preferCanvas: true,
    }).setView(pointTuple(location), DEFAULT_ZOOM)

    L.tileLayer(VOYAGER_TILES, {
      maxZoom: 20,
      subdomains: 'abcd',
      attribution: MAP_ATTRIBUTION,
      crossOrigin: true,
    }).addTo(map)

    L.control.zoom({ position: 'bottomright' }).addTo(map)

    const markerIcon = L.divIcon({
      className: 'fleurstales-map-pin-shell',
      html: '<div class="fleurstales-map-pin"><span></span></div>',
      iconSize: [38, 46],
      iconAnchor: [19, 42],
    })

    const marker = L.marker(pointTuple(location), {
      draggable: isEditing,
      icon: markerIcon,
      keyboard: true,
      autoPan: true,
      autoPanPadding: [44, 44],
    }).addTo(map)

    const radius = L.circle(pointTuple(location), {
      radius: radiusMeters,
      color: primary,
      fillColor: primary,
      fillOpacity: 0.08,
      opacity: 0.45,
      weight: 2,
      interactive: false,
    }).addTo(map)

    const commitPoint = (lat: number, lng: number) => {
      const next = { latitude: Number(lat.toFixed(6)), longitude: Number(lng.toFixed(6)) }
      marker.setLatLng(pointTuple(next))
      radius.setLatLng(pointTuple(next))
      onLocationChangeRef.current(next)
    }

    map.on('click', (event) => {
      if (!editingRef.current) return
      commitPoint(event.latlng.lat, event.latlng.lng)
    })

    marker.on('dragend', (event) => {
      if (!editingRef.current) return
      const point = event.target.getLatLng()
      commitPoint(point.lat, point.lng)
    })

    mapRef.current = map
    markerRef.current = marker
    radiusRef.current = radius
    setMapAvailable(true)

    const resizeTimer = window.setTimeout(() => map.invalidateSize({ animate: false }), 80)
    return () => {
      window.clearTimeout(resizeTimer)
      map.remove()
      mapRef.current = null
      markerRef.current = null
      radiusRef.current = null
    }
  }, [])

  useEffect(() => {
    markerRef.current?.setLatLng(pointTuple(location))
    radiusRef.current?.setLatLng(pointTuple(location))
    if (mapRef.current) {
      mapRef.current.flyTo(pointTuple(location), Math.max(mapRef.current.getZoom(), DEFAULT_ZOOM), {
        animate: true,
        duration: 0.55,
      })
    }
  }, [location.latitude, location.longitude])

  useEffect(() => {
    radiusRef.current?.setRadius(radiusMeters)
  }, [radiusMeters])

  const useCurrentLocation = () => {
    setLocationError(null)
    if (!navigator.geolocation) {
      setLocationError('Location access is not available in this browser.')
      return
    }

    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const next = {
          latitude: Number(position.coords.latitude.toFixed(6)),
          longitude: Number(position.coords.longitude.toFixed(6)),
        }
        onLocationChange(next)
        setLocating(false)
      },
      (error) => {
        setLocationError(error.code === 1 ? 'Allow location access, then try again.' : 'Couldn’t get a reliable location. Try again outdoors or move the pin manually.')
        setLocating(false)
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 },
    )
  }

  const mapUrl = `https://www.openstreetmap.org/?mlat=${location.latitude}&mlon=${location.longitude}#map=19/${location.latitude}/${location.longitude}`
  const staticMapSrc = `https://www.openstreetmap.org/export/embed.html?bbox=${location.longitude - 0.003}%2C${location.latitude - 0.003}%2C${location.longitude + 0.003}%2C${location.latitude + 0.003}&layer=mapnik&marker=${location.latitude}%2C${location.longitude}`

  return (
    <div className="space-y-3">
      <div className="relative overflow-hidden rounded-xl border border-border/70 bg-muted shadow-sm">
        <div ref={mapElementRef} className="branch-map-picker h-[17rem] w-full sm:h-[20rem]" aria-label={`${branchName || 'Branch'} attendance location map`} />

        {!mapAvailable && (
          <iframe
            title={`${branchName || 'Branch'} map preview`}
            loading="lazy"
            className="absolute inset-0 h-full w-full border-0"
            src={staticMapSrc}
          />
        )}

        {isEditing && mapAvailable && (
          <div className="pointer-events-none absolute left-3 top-3 z-[450] inline-flex items-center gap-1.5 rounded-full bg-background/95 px-3 py-2 text-2xs font-semibold text-foreground shadow-md ring-1 ring-border/60 backdrop-blur-sm">
            <MousePointer2 className="size-3.5 text-primary" />
            Click map or drag the pin
          </div>
        )}

        <div className="absolute bottom-3 left-3 z-[450] max-w-[calc(100%-5.5rem)] rounded-lg bg-background/95 px-3 py-2 shadow-md ring-1 ring-border/60 backdrop-blur-sm">
          <div className="flex items-start gap-2">
            <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
              <MapPin className="size-3.5" />
            </span>
            <div>
              <p className="text-2xs font-semibold text-foreground">Attendance zone</p>
              <p className="mt-0.5 text-2xs leading-4 text-muted-foreground">Accepted within {radiusMeters.toLocaleString('en-US')} m of this pin.</p>
            </div>
          </div>
        </div>
      </div>

      {isEditing && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <button
            type="button"
            onClick={useCurrentLocation}
            disabled={locating}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-full border border-border bg-background px-4 text-xs font-semibold text-foreground shadow-sm transition hover:bg-muted disabled:cursor-wait disabled:opacity-60"
          >
            <LocateFixed className={`size-4 ${locating ? 'animate-pulse' : ''}`} />
            {locating ? 'Finding your location…' : 'Use current location'}
          </button>
          <p className="text-2xs leading-4 text-muted-foreground sm:max-w-xs sm:text-right">For the cleanest attendance check, place the pin at the staff entrance or check-in point.</p>
        </div>
      )}

      {locationError && (
        <p role="alert" className="rounded-lg bg-warning/10 px-3 py-2 text-xs font-medium text-warning ring-1 ring-warning/20">{locationError}</p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 text-2xs text-muted-foreground">
        <span>{location.latitude.toFixed(6)}, {location.longitude.toFixed(6)}</span>
        <a href={mapUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 font-semibold text-primary hover:underline">
          <ExternalLink className="size-3.5" />
          Open in OpenStreetMap
        </a>
      </div>
    </div>
  )
}
