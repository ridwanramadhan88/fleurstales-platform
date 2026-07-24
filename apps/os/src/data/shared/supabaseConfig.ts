export interface SupabasePublicConfig {
  url: string
  publishableKey: string
}

export interface FleurstalesRuntimeConfig {
  /** Legacy local backend values retained for compatibility during migration. */
  apiUrl?: string
  apiToken?: string
  supabaseUrl?: string
  supabasePublishableKey?: string
}

export type SupabaseConfigState =
  | { enabled: false; reason: 'missing_url' | 'missing_publishable_key' }
  | { enabled: true; config: SupabasePublicConfig }

const runtimeConfig = (): FleurstalesRuntimeConfig =>
  (globalThis as typeof globalThis & { __FLEURSTALES_CONFIG__?: FleurstalesRuntimeConfig }).__FLEURSTALES_CONFIG__ ?? {}

const normalizeUrl = (value: string): string => value.trim().replace(/\/+$/, '')

/**
 * Browser-safe Supabase configuration only.
 * Credentials are injected through `globalThis.__FLEURSTALES_CONFIG__` so the
 * current custom esbuild pipeline does not need Vite-specific `import.meta.env`.
 * Never expose a service-role/secret key in either frontend build.
 */
export const resolveSupabaseConfig = (): SupabaseConfigState => {
  const runtime = runtimeConfig()
  const url = normalizeUrl(runtime.supabaseUrl ?? '')
  if (!url) return { enabled: false, reason: 'missing_url' }

  const publishableKey = (runtime.supabasePublishableKey ?? '').trim()
  if (!publishableKey) return { enabled: false, reason: 'missing_publishable_key' }

  return { enabled: true, config: { url, publishableKey } }
}

export const isSupabaseConfigured = (): boolean => resolveSupabaseConfig().enabled
