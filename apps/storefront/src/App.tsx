import { useEffect, useState } from 'react'
import StorefrontPage from './pages/Storefront'
import StorefrontOrderTrackingPage from './pages/StorefrontOrderTrackingPage'
import {
  STOREFRONT_NAVIGATION_EVENT,
  type StorefrontNavigationDetail,
} from './lib/storefrontNavigation'

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

  const trackingId = readTrackingId()
  if (trackingId || isManualTrackingRoute()) {
    return <StorefrontOrderTrackingPage trackingId={trackingId} />
  }

  return <StorefrontPage />
}
