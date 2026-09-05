/**
 * @file middleware.ts
 * @description Vercel Routing Middleware for WhatsApp/social previews on
 * secure order-tracking links. Real visitors fall through to the Vite SPA;
 * supported crawlers receive a tiny OG document generated from the same
 * anonymous tracking RPC used by the Storefront.
 */

import { next } from '@vercel/functions'

const CRAWLER_UA = /facebookexternalhit|WhatsApp|Twitterbot|Slackbot|LinkedInBot|TelegramBot/i

// Until a branded fallback share image is supplied, omit og:image rather than
// pointing crawlers at a known-missing asset. Ready links use the real finish photo.
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
  const legacyMatch = url.pathname.match(/^\/order\/([^/]+)\/?$/)
  if (legacyMatch) return { trackingKey: decodeURIComponent(legacyMatch[1]) }
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
  const publishableKey = process.env.FLEURSTALES_SUPABASE_PUBLISHABLE_KEY
  if (!supabaseUrl || !publishableKey) return null

  try {
    const response = await fetch(`${supabaseUrl.replace(/\/+$/, '')}/rest/v1/rpc/get_order_public_status`, {
      method: 'POST',
      headers: {
        apikey: publishableKey,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ p_tracking_id: trackingKey }),
    })
    if (!response.ok) return null
    const data = (await response.json()) as PublicOrderOgData | null
    return data?.orderNumber ? data : null
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
  image?: string
  url: string
}): string => `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>${escapeHtml(title)}</title>
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(description)}">
${image ? `<meta property="og:image" content="${escapeHtml(image)}">` : ''}
<meta property="og:url" content="${escapeHtml(url)}">
<meta property="og:type" content="website">
<meta name="twitter:card" content="${image ? 'summary_large_image' : 'summary'}">
</head>
<body></body>
</html>`

export default async function middleware(request: Request): Promise<Response> {
  const userAgent = request.headers.get('user-agent') ?? ''
  if (!CRAWLER_UA.test(userAgent)) return next()

  const parsed = parseTrackingRequest(new URL(request.url))
  if (!parsed?.trackingKey) return next()

  const order = await fetchOrderForOg(parsed.trackingKey)
  if (!order) return next()

  const image = parsed.moment === 'ready' && order.finishPhotoUrl ? order.finishPhotoUrl : undefined
  const statusLabel = STATUS_LABELS_ID[order.status] ?? order.status

  return new Response(
    renderOgHtml({
      title: `Pesanan ${order.orderNumber} — Fleurstales`,
      description: statusLabel,
      image,
      url: request.url,
    }),
    { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'private, no-store' } },
  )
}

export const config = {
  matcher: ['/track/:path*', '/order/:path*'],
}
