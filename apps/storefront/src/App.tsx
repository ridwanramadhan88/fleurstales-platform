import { useEffect, useState } from 'react'
import StorefrontPage from './pages/Storefront'
import StorefrontOrderTrackingPage from './pages/StorefrontOrderTrackingPage'

export const STOREFRONT_NAVIGATION_EVENT = 'fleurstales:storefront-navigation'

const readTrackingId = (): string | undefined => {
  const normalizedPath = window.location.pathname.replace(/\/+$/, '')
  const match = normalizedPath.match(/^\/order\/([^/]+)$/)
  return match ? decodeURIComponent(match[1]) : undefined
}

const isManualTrackingRoute = (): boolean =>
  window.location.pathname.replace(/\/+$/, '') === '/track'

export default function App() {
  const [, setRouteRevision] = useState(0)

  useEffect(() => {
    const refresh = () => setRouteRevision((value) => value + 1)
    window.addEventListener('popstate', refresh)
    window.addEventListener(STOREFRONT_NAVIGATION_EVENT, refresh)
    return () => {
      window.removeEventListener('popstate', refresh)
      window.removeEventListener(STOREFRONT_NAVIGATION_EVENT, refresh)
    }
  }, [])

  const trackingId = readTrackingId()
  if (trackingId || isManualTrackingRoute()) {
    return <StorefrontOrderTrackingPage trackingId={trackingId} />
  }

  return <StorefrontPage />
}
