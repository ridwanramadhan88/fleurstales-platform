/**
 * @file serverAuthority.ts
 * @description Single answer to "does a server own business writes here?".
 *
 * `isSharedBackendConfigured()` only detects the retired legacy API URL and is
 * false in the Supabase production build. Using it as the gate for money,
 * ledger or point writes silently sent production down the local-demo path
 * (client-side ledger postings, client-side contribution points, and finance
 * decisions that skipped the audited RPC). Every such gate must use this
 * helper instead; keep `isSharedBackendConfigured()` for legacy-login plumbing.
 */

import { isSharedBackendConfigured } from '../api/remoteSession'
import { isSupabaseConfigured } from './shared/supabaseConfig'

export const isServerAuthoritative = (): boolean =>
  isSupabaseConfigured() || isSharedBackendConfigured()
