import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { isServerAuthoritative } from './serverAuthority'
import { useOrdersStore } from '../store/ordersStore'
import { useFinanceStore } from '../store/financeStore'
import { useHrStore } from '../store/hrStore'
import { useSettingsStore } from '../store/settingsStore'
import type { OrderTableRow } from '../types/orders'

type ConfigHost = typeof globalThis & { __FLEURSTALES_CONFIG__?: Record<string, string> }
const host = globalThis as ConfigHost
const originalConfig = host.__FLEURSTALES_CONFIG__
const actor = { employeeId: 'owner-1', name: 'Owner', role: 'owner' as const }

const useSupabaseBuild = () => {
  // Same shape as the production build: Supabase only, no legacy apiUrl.
  host.__FLEURSTALES_CONFIG__ = { supabaseUrl: 'https://example.supabase.co', supabasePublishableKey: 'sb_publishable_test' }
}

beforeEach(() => {
  useOrdersStore.setState({ orders: [], lastSequence: {} })
  useFinanceStore.setState({ transactions: [] })
  useHrStore.setState({ employeePointEntries: [] })
  useSettingsStore.setState((state) => ({ ...state, storeProfile: { ...state.storeProfile, inventoryEnabled: false } }))
})
afterEach(() => { host.__FLEURSTALES_CONFIG__ = originalConfig })

describe('server authority gate', () => {
  it('treats a Supabase-only build as server authoritative', () => {
    host.__FLEURSTALES_CONFIG__ = {}
    expect(isServerAuthoritative()).toBe(false)
    useSupabaseBuild()
    expect(isServerAuthoritative()).toBe(true)
  })

  it('does not post a client-side ledger row for an order paid at creation in Supabase mode', () => {
    useSupabaseBuild()
    const order = useOrdersStore.getState().createOrder({
      actor, branch: 'Kedamaian', customerName: 'Ridwan', orderType: 'walk_in', fulfillmentType: 'pickup',
      depositAmount: 0, totalIdr: 300_000, paymentStatus: 'paid', notes: null, productName: 'Bouquet',
    })
    expect(order.paymentStatus).toBe('paid')
    expect(order.paymentHistory?.[0]?.ledgerTransactionId).toBeUndefined()
    expect(useFinanceStore.getState().transactions).toHaveLength(0)
  })

  it('still posts the ledger row locally in the offline demo build', () => {
    host.__FLEURSTALES_CONFIG__ = {}
    useOrdersStore.getState().createOrder({
      actor, branch: 'Kedamaian', customerName: 'Ridwan', orderType: 'walk_in', fulfillmentType: 'pickup',
      depositAmount: 0, totalIdr: 300_000, paymentStatus: 'paid', notes: null, productName: 'Bouquet',
    })
    expect(useFinanceStore.getState().transactions).toHaveLength(1)
  })

  it('leaves contribution points to the server in Supabase mode', () => {
    useSupabaseBuild()
    const order = {
      orderNumber: 'KDM-2026-0001', customerName: 'C', source: 'walk_in', fulfillment: 'pickup', status: 'picked_up',
      totalIdr: 500_000, branch: 'Kedamaian', paymentStatus: 'paid', createdAtLabel: 'x', financeVerified: true,
      financeVerifiedAt: '2026-08-10T10:00:00.000Z', completedAt: '2026-08-10T10:00:00.000Z', adminHandledEmployeeId: 'emp-akbar',
    } as OrderTableRow
    expect(useHrStore.getState().syncOrderContributionPoints({ orders: [order], actor: { name: 'Finance', role: 'finance' } }))
      .toMatchObject({ ok: true, created: 0 })
    expect(useHrStore.getState().employeePointEntries).toHaveLength(0)
  })
})
