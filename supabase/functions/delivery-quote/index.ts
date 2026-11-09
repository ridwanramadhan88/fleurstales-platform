import { createClient } from 'npm:@supabase/supabase-js@2.110.8'

// Measures the road distance from a branch to the customer's map pin with the
// Google Routes API (server key, never sent to the browser) and stores it as a
// short-lived quote. The fee itself is computed in the database from the quote.

const MAX_BODY_BYTES = 2048
const ROUTES_URL = 'https://routes.googleapis.com/distance/v2:computeRoutes'

const configuredOrigins = (): string[] => (Deno.env.get('FLEURSTALES_ALLOWED_ORIGINS') ?? '')
  .split(',').map((value) => value.trim()).filter(Boolean)

const corsHeaders = (request: Request): Record<string, string> => {
  const origin = request.headers.get('origin')
  const allowed = configuredOrigins()
  const selectedOrigin = origin && allowed.length > 0 ? (allowed.includes(origin) ? origin : 'null') : (origin ?? '*')
  return {
    'access-control-allow-origin': selectedOrigin,
    'access-control-allow-headers': 'authorization, apikey, content-type, x-client-info',
    'access-control-allow-methods': 'POST, OPTIONS',
    'vary': 'Origin',
  }
}

const json = (request: Request, body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', ...corsHeaders(request) },
})

const getSecretKey = (): string => {
  const modern = Deno.env.get('SUPABASE_SECRET_KEYS')
  if (modern) {
    try {
      const parsed = JSON.parse(modern) as Record<string, string>
      if (parsed.default) return parsed.default
      const first = Object.values(parsed).find(Boolean)
      if (first) return first
    } catch { /* fall through */ }
  }
  return Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
}

const isCoordinate = (value: unknown, limit: number): value is number =>
  typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= limit

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(request) })
  if (request.method !== 'POST') return json(request, { error: 'METHOD_NOT_ALLOWED' }, 405)

  const raw = await request.text()
  if (raw.length > MAX_BODY_BYTES) return json(request, { error: 'BODY_TOO_LARGE' }, 413)
  let body: { branchId?: unknown; latitude?: unknown; longitude?: unknown }
  try { body = JSON.parse(raw) } catch { return json(request, { error: 'INVALID_JSON' }, 400) }

  const branchId = typeof body.branchId === 'string' ? body.branchId : ''
  if (!branchId || !isCoordinate(body.latitude, 90) || !isCoordinate(body.longitude, 180)) {
    return json(request, { error: 'INVALID_REQUEST' }, 400)
  }

  const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', getSecretKey(), { auth: { persistSession: false } })
  const { data: branch, error: branchError } = await supabase
    .from('branches')
    .select('id, latitude, longitude, max_delivery_km, is_active')
    .eq('id', branchId).maybeSingle()
  if (branchError || !branch || !branch.is_active) return json(request, { error: 'BRANCH_UNAVAILABLE' }, 404)
  if (branch.latitude == null || branch.longitude == null) return json(request, { error: 'BRANCH_LOCATION_MISSING' }, 422)

  const googleKey = Deno.env.get('GOOGLE_MAPS_SERVER_KEY')
  if (!googleKey) return json(request, { error: 'DISTANCE_SERVICE_UNAVAILABLE' }, 503)

  // Cheap straight-line guard so far-away pins never spend a Google request.
  const toRad = (deg: number) => deg * Math.PI / 180
  const dLat = toRad(body.latitude - branch.latitude)
  const dLng = toRad(body.longitude - branch.longitude)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(branch.latitude)) * Math.cos(toRad(body.latitude)) * Math.sin(dLng / 2) ** 2
  const straightKm = 6371 * 2 * Math.asin(Math.sqrt(h))
  if (straightKm > Number(branch.max_delivery_km)) {
    return json(request, { error: 'DELIVERY_OUT_OF_RANGE', distanceKm: Math.round(straightKm * 10) / 10, maxDistanceKm: Number(branch.max_delivery_km) })
  }

  let distanceMeters: number | null = null
  try {
    const response = await fetch(ROUTES_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-goog-api-key': googleKey,
        'x-goog-fieldmask': 'routes.distanceMeters',
      },
      body: JSON.stringify({
        origin: { location: { latLng: { latitude: branch.latitude, longitude: branch.longitude } } },
        destination: { location: { latLng: { latitude: body.latitude, longitude: body.longitude } } },
        travelMode: 'DRIVE',
        routingPreference: 'TRAFFIC_UNAWARE',
      }),
    })
    if (!response.ok) {
      console.warn('delivery-quote google error', { status: response.status })
      return json(request, { error: 'DISTANCE_SERVICE_UNAVAILABLE' }, 502)
    }
    const data = await response.json() as { routes?: Array<{ distanceMeters?: number }> }
    distanceMeters = data.routes?.[0]?.distanceMeters ?? null
  } catch {
    return json(request, { error: 'DISTANCE_SERVICE_UNAVAILABLE' }, 502)
  }
  if (distanceMeters == null) return json(request, { error: 'NO_ROUTE' }, 422)

  const distanceKm = Math.round(distanceMeters / 100) / 10
  if (distanceKm > Number(branch.max_delivery_km)) {
    return json(request, { error: 'DELIVERY_OUT_OF_RANGE', distanceKm, maxDistanceKm: Number(branch.max_delivery_km) })
  }

  const { data: quote, error: quoteError } = await supabase
    .from('delivery_quotes')
    .insert({ branch_id: branchId, latitude: body.latitude, longitude: body.longitude, distance_km: distanceKm })
    .select('id, expires_at').single()
  if (quoteError || !quote) return json(request, { error: 'QUOTE_FAILED' }, 500)

  return json(request, { quoteId: quote.id, distanceKm, expiresAt: quote.expires_at })
})
