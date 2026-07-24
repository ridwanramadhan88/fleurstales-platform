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

  async rpc<T>(functionName: string, args: Record<string, Json | undefined>): Promise<T> {
    return this.request<T>(`/rest/v1/rpc/${functionName}`, {
      method: 'POST',
      body: JSON.stringify(args),
    })
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const accessToken = await this.tokenProvider?.getAccessToken()
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
