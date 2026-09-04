import { useEffect, useState } from 'react'
import StorefrontPage from './pages/Storefront'
import StorefrontOrderTrackingPage from './pages/StorefrontOrderTrackingPage'
import {
  STOREFRONT_NAVIGATION_EVENT,
  type StorefrontNavigationDetail,
} from './lib/storefrontNavigation'

interface TrackingRoute {
  trackingId?: string
  orderNumber?: string
  legacy?: boolean
}

const readTrackingRoute = (): TrackingRoute => {
  const normalizedPath = window.location.pathname.replace(/\/+$/, '')
  const readable = normalizedPath.match(/^\/track\/([^/]+)$/)
  if (readable) {
    const key = new URLSearchParams(window.location.search).get('key') ?? undefined
    return {
      orderNumber: decodeURIComponent(readable[1]),
      trackingId: key,
    }
  }

  const legacy = normalizedPath.match(/^\/order\/([^/]+)$/)
  if (legacy) {
    return { trackingId: decodeURIComponent(legacy[1]), legacy: true }
  }

  return {}
}

const isManualTrackingRoute = (): boolean =>
  window.location.pathname.replace(/\/+$/, '') === '/track'

export default function App() {
  const [, setRouteRevision] = useState(0)

  useEffect(() => {
    const refresh = () => setRouteRevision((value) => value + 1)
    const navigate = (event: Event) => {
      const detail = (event as CustomEvent<StorefrontNavigationDetail>).detail
      if (!detail?.path) return
      if (detail.replace) window.history.replaceState({}, '', detail.path)
      else window.history.pushState({}, '', detail.path)
      refresh()
      window.scrollTo({ top: 0 })
    }

    window.addEventListener('popstate', refresh)
    window.addEventListener(STOREFRONT_NAVIGATION_EVENT, navigate)
    return () => {
      window.removeEventListener('popstate', refresh)
      window.removeEventListener(STOREFRONT_NAVIGATION_EVENT, navigate)
    }
  }, [])

  const trackingRoute = readTrackingRoute()
  if (trackingRoute.trackingId || trackingRoute.orderNumber || isManualTrackingRoute()) {
    return (
      <StorefrontOrderTrackingPage
        trackingId={trackingRoute.trackingId}
        orderNumber={trackingRoute.orderNumber}
        legacyRoute={trackingRoute.legacy}
      />
    )
  }

  return <StorefrontPage />
}
