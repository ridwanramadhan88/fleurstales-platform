/**
 * @file middleware.ts
 * @description Vercel Edge Middleware for the WhatsApp/social link-preview
 * problem on order tracking links: crawlers (WhatsApp, Facebook, etc.) hit
 * the SPA shell and see no per-order og:image/og:title, and WhatsApp caches
 * whatever it first saw for a URL for about a week. This middleware detects
 * those crawlers on the tracking routes only, looks the order up with the
 * anon key (RLS-scoped, same as the client-side tracking page), and returns
 * a tiny server-rendered HTML document with the right OG tags instead of the
 * SPA shell. Every other request (real visitors, and crawlers on any other
 * route) falls through unchanged to the existing SPA rewrite in vercel.json.
 *
 * This app is a Vite SPA, not Next.js, so this file intentionally uses the
 * framework-agnostic `@vercel/edge` middleware API (`Request`/`next()`)
 * rather than `next/server` — `next/server` is not available outside a
 * Next.js project and would fail to build here.
 */

import { next } from '@vercel/edge'

const CRAWLER_UA = /facebookexternalhit|WhatsApp|Twitterbot|Slackbot|LinkedInBot|TelegramBot/i

const DEFAULT_OG_IMAGE = 'https://fleurstales-storefront.vercel.app/og-default.jpg'

interface ParsedTrackingRequest {
  orderNumber?: string
  trackingKey?: string
  moment?: string
}

const parseTrackingRequest = (url: URL): ParsedTrackingRequest | null => {
  const trackMatch = url.pathname.match(/^\/track\/([^/]+)\/?$/)
  if (trackMatch) {
    return {
      orderNumber: decodeURIComponent(trackMatch[1]),
      trackingKey: url.searchParams.get('key') ?? undefined,
      moment: url.searchParams.get('v') ?? undefined,
    }
  }
  // Legacy links already in circulation before the /track canonicalization —
  // the trackingId in the path *is* the tracking key (public_tracking_id).
  const legacyMatch = url.pathname.match(/^\/order\/([^/]+)\/?$/)
  if (legacyMatch) {
    return { trackingKey: decodeURIComponent(legacyMatch[1]) }
  }
  return null
}

interface PublicOrderOgData {
  orderNumber: string
  status: string
  finishPhotoUrl?: string | null
}

const STATUS_LABELS_ID: Record<string, string> = {
  pending_verification: 'Menunggu konfirmasi',
  confirmed: 'Order dikonfirmasi',
  processing: 'Sedang diproses',
  ready: 'Siap',
  delivering: 'Dalam pengiriman',
  delivered: 'Selesai',
  picked_up: 'Selesai',
  cancelled: 'Dibatalkan',
  failed: 'Perlu perhatian',
}

const fetchOrderForOg = async (trackingKey: string): Promise<PublicOrderOgData | null> => {
  const supabaseUrl = process.env.FLEURSTALES_SUPABASE_URL
  const anonKey = process.env.FLEURSTALES_SUPABASE_PUBLISHABLE_KEY
  if (!supabaseUrl || !anonKey) return null

  try {
    const response = await fetch(`${supabaseUrl.replace(/\/+$/, '')}/rest/v1/rpc/get_order_public_status`, {
      method: 'POST',
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ p_tracking_id: trackingKey }),
    })
    if (!response.ok) return null
    const data = (await response.json()) as PublicOrderOgData | null
    if (!data?.orderNumber) return null
    return data
  } catch {
    return null
  }
}

const escapeHtml = (value: string): string =>
  value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[character] as string))

const renderOgHtml = ({
  title,
  description,
  image,
  url,
}: {
  title: string
  description: string
  image: string
  url: string
}): string => `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>${escapeHtml(title)}</title>
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(description)}">
<meta property="og:image" content="${escapeHtml(image)}">
<meta property="og:url" content="${escapeHtml(url)}">
<meta property="og:type" content="website">
<meta name="twitter:card" content="summary_large_image">
<meta http-equiv="refresh" content="0; url=${escapeHtml(url)}">
</head>
<body></body>
</html>`

export default async function middleware(request: Request): Promise<Response> {
  const userAgent = request.headers.get('user-agent') ?? ''
  if (!CRAWLER_UA.test(userAgent)) return next()

  const url = new URL(request.url)
  const parsed = parseTrackingRequest(url)
  if (!parsed?.trackingKey) return next()

  const order = await fetchOrderForOg(parsed.trackingKey)
  if (!order) return next()

  const image = parsed.moment === 'ready' && order.finishPhotoUrl ? order.finishPhotoUrl : DEFAULT_OG_IMAGE
  const statusLabel = STATUS_LABELS_ID[order.status] ?? order.status

  return new Response(
    renderOgHtml({
      title: `Pesanan ${order.orderNumber} — Fleurstales`,
      description: statusLabel,
      image,
      url: request.url,
    }),
    { headers: { 'content-type': 'text/html; charset=utf-8' } },
  )
}

export const config = {
  matcher: ['/track/:path*', '/order/:path*'],
}
