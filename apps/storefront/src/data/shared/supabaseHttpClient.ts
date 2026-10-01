import type { Json, PublicTableName, RowOf } from './databaseTypes'
import type { SupabasePublicConfig } from './supabaseConfig'

export interface SupabaseAuthTokenProvider {
  getAccessToken(): Promise<string | null> | string | null
}

export interface SupabaseSelectOptions {
  select?: string
  filters?: Record<string, string | number | boolean>
  order?: Array<{ column: string; ascending?: boolean }>
  limit?: number
}

export class SupabaseHttpError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly payload: unknown,
  ) {
    super(message)
    this.name = 'SupabaseHttpError'
  }
}

const buildQuery = (options: SupabaseSelectOptions = {}): string => {
  const params = new URLSearchParams()
  params.set('select', options.select ?? '*')

  for (const [column, value] of Object.entries(options.filters ?? {})) {
    params.set(column, typeof value === 'boolean' ? `eq.${String(value)}` : `eq.${value}`)
  }

  if (options.order?.length) {
    params.set(
      'order',
      options.order.map(({ column, ascending = true }) => `${column}.${ascending ? 'asc' : 'desc'}`).join(','),
    )
  }

  if (typeof options.limit === 'number') params.set('limit', String(options.limit))
  return params.toString()
}

// These mutation entrypoints were renamed after a production conflict storm.
// Keeping the mapping here means every current caller uses the guarded RPCs,
// while stale browser tabs that still call the retired names are rejected by
// Postgres before they can execute the expensive mutation logic.
const GUARDED_RPC_NAMES: Record<string, string> = {
  save_hr_operational_state: 'save_hr_operational_state_guarded',
  save_order_operational_state: 'save_order_operational_state_guarded',
  replace_catalog_snapshot: 'replace_catalog_snapshot_guarded',
  replace_catalog_flower_recipes: 'replace_catalog_flower_recipes_guarded',
  replace_product_images_metadata: 'replace_product_images_metadata_guarded',
}

// Client-side retry brake. A screen that keeps re-sending a failing write (stale revision,
// revoked permission, server overload) must never be able to flood the API again. After
// RPC_BREAKER_THRESHOLD consecutive failures of the same RPC within RPC_BREAKER_WINDOW_MS the
// call fails locally, without any network request, for a cooldown that doubles on every
// repeat (30s up to 10min). A success, or an explicit reset after reloading fresh data,
// closes the breaker.
const RPC_BREAKER_THRESHOLD = 3
const RPC_BREAKER_WINDOW_MS = 10_000
const RPC_BREAKER_BASE_COOLDOWN_MS = 30_000
const RPC_BREAKER_MAX_COOLDOWN_MS = 600_000

interface RpcBreakerState {
  failures: number
  windowStartedAt: number
  blockedUntil: number
  nextCooldownMs: number
}

const rpcBreakers = new Map<string, RpcBreakerState>()

export const RPC_CIRCUIT_OPEN = 'RPC_CIRCUIT_OPEN'

export const resetSupabaseRpcBreakers = (): void => {
  rpcBreakers.clear()
}

const breakerFor = (rpcName: string): RpcBreakerState => {
  let state = rpcBreakers.get(rpcName)
  if (!state) {
    state = { failures: 0, windowStartedAt: 0, blockedUntil: 0, nextCooldownMs: RPC_BREAKER_BASE_COOLDOWN_MS }
    rpcBreakers.set(rpcName, state)
  }
  return state
}

const recordRpcFailure = (rpcName: string, now: number): void => {
  const state = breakerFor(rpcName)
  if (now - state.windowStartedAt > RPC_BREAKER_WINDOW_MS) {
    state.windowStartedAt = now
    state.failures = 0
  }
  state.failures += 1
  if (state.failures >= RPC_BREAKER_THRESHOLD) {
    state.blockedUntil = now + state.nextCooldownMs
    state.nextCooldownMs = Math.min(state.nextCooldownMs * 2, RPC_BREAKER_MAX_COOLDOWN_MS)
    state.failures = 0
    state.windowStartedAt = now
  }
}

const recordRpcSuccess = (rpcName: string): void => {
  rpcBreakers.delete(rpcName)
}

export class SupabaseHttpClient {
  constructor(
    private readonly config: SupabasePublicConfig,
    private readonly tokenProvider?: SupabaseAuthTokenProvider,
  ) {}

  get publicUrl(): string {
    return this.config.url
  }

  storagePublicUrl(bucket: string, path: string): string {
    const safeBucket = bucket.split('/').map(encodeURIComponent).join('/')
    const safePath = path.split('/').map(encodeURIComponent).join('/')
    return `${this.config.url}/storage/v1/object/public/${safeBucket}/${safePath}`
  }

  async uploadStorageObject(
    bucket: string,
    path: string,
    body: Blob,
    options?: { upsert?: boolean; cacheControl?: string },
  ): Promise<{ Key?: string; Id?: string }> {
    const safeBucket = bucket.split('/').map(encodeURIComponent).join('/')
    const safePath = path.split('/').map(encodeURIComponent).join('/')
    return this.request<{ Key?: string; Id?: string }>(`/storage/v1/object/${safeBucket}/${safePath}`, {
      method: 'POST',
      headers: {
        'Content-Type': body.type || 'application/octet-stream',
        'cache-control': options?.cacheControl ?? '3600',
        'x-upsert': options?.upsert ? 'true' : 'false',
      },
      body,
    })
  }

  async removeStorageObjects(bucket: string, paths: string[]): Promise<void> {
    if (paths.length === 0) return
    const safeBucket = bucket.split('/').map(encodeURIComponent).join('/')
    await this.request(`/storage/v1/object/${safeBucket}`, {
      method: 'DELETE',
      body: JSON.stringify({ prefixes: paths }),
    })
  }

  async select<T extends PublicTableName>(table: T, options?: SupabaseSelectOptions): Promise<RowOf<T>[]> {
    return this.request<RowOf<T>[]>(`/rest/v1/${table}?${buildQuery(options)}`)
  }

  async update<T extends PublicTableName>(
    table: T,
    filters: Record<string, string | number | boolean>,
    values: Partial<RowOf<T>>,
  ): Promise<RowOf<T>[]> {
    const query = buildQuery({ filters })
    return this.request<RowOf<T>[]>(`/rest/v1/${table}?${query}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify(values),
    })
  }

  async upsert<T extends PublicTableName>(
    table: T,
    values: Partial<RowOf<T>> | Partial<RowOf<T>>[],
    onConflict?: string,
  ): Promise<RowOf<T>[]> {
    const query = onConflict ? `?on_conflict=${encodeURIComponent(onConflict)}` : ''
    return this.request<RowOf<T>[]>(`/rest/v1/${table}${query}`, {
      method: 'POST',
      headers: { Prefer: 'return=representation,resolution=merge-duplicates' },
      body: JSON.stringify(values),
    })
  }

  async rpc<T>(functionName: string, args: Record<string, Json | undefined>): Promise<T> {
    const rpcName = GUARDED_RPC_NAMES[functionName] ?? functionName
    const now = Date.now()
    const breaker = rpcBreakers.get(rpcName)
    if (breaker && breaker.blockedUntil > now) {
      throw new SupabaseHttpError(
        'Permintaan ditahan sementara karena gagal berulang. Muat ulang halaman lalu coba lagi.',
        429,
        { code: RPC_CIRCUIT_OPEN, rpc: rpcName, retryAfterMs: breaker.blockedUntil - now },
      )
    }
    try {
      const result = await this.request<T>(`/rest/v1/rpc/${rpcName}`, {
        method: 'POST',
        body: JSON.stringify(args),
      })
      recordRpcSuccess(rpcName)
      return result
    } catch (error) {
      // SESSION_REQUIRED is raised locally before any request is sent, so it is not a server failure.
      const isLocalSessionGap = error instanceof SupabaseHttpError && error.status === 401
        && typeof error.payload === 'object' && error.payload !== null
        && 'code' in error.payload && error.payload.code === 'SESSION_REQUIRED'
      if (!isLocalSessionGap) recordRpcFailure(rpcName, Date.now())
      throw error
    }
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const accessToken = await this.tokenProvider?.getAccessToken()
    // A token provider means this client belongs to an authenticated staff
    // workflow. Never silently downgrade a protected OS request to the anon
    // publishable-key role when the browser session bridge is empty or racing
    // with sign-out/token refresh. Public Storefront clients do not provide a
    // token provider and keep their existing anonymous behavior.
    if (this.tokenProvider && !accessToken) {
      throw new SupabaseHttpError('SESSION_REQUIRED', 401, { code: 'SESSION_REQUIRED' })
    }

    const headers = new Headers(init.headers)
    headers.set('apikey', this.config.publishableKey)
    if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`)
    else headers.delete('Authorization')
    headers.set('Accept', 'application/json')
    if (init.body != null && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 8000)
    let response: Response
    try {
      response = await fetch(`${this.config.url}${path}`, {
        ...init,
        headers,
        signal: init.signal ?? controller.signal,
      })
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new SupabaseHttpError('Supabase request timed out.', 408, null)
      }
      throw error
    } finally {
      clearTimeout(timeout)
    }
    const text = await response.text()
    let payload: unknown = null
    if (text) {
      try {
        payload = JSON.parse(text) as unknown
      } catch {
        payload = text
      }
    }

    if (!response.ok) {
      const serverMessage =
        typeof payload === 'object' && payload !== null && 'message' in payload && typeof payload.message === 'string'
          ? payload.message
          : `Supabase request failed with HTTP ${response.status}.`
      throw new SupabaseHttpError(serverMessage, response.status, payload)
    }

    return payload as T
  }
}
