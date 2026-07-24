/**
 * @file storeHarness.ts
 * @description Minimal fake Zustand `set`/`get` pair for unit-testing store
 * action slices (e.g. ordersStoreFinanceActions, ordersStoreChangeRequestActions)
 * in isolation from the real persisted `useOrdersStore` — no localStorage,
 * no BroadcastChannel, no seed data. Mirrors just enough of Zustand's
 * `StateCreator` `set` signature (partial state or updater function, with an
 * optional `replace` flag) for the store slices under test.
 */
import type { OrderTableRow } from '../../types/orders'

export interface FakeOrdersState {
  orders: OrderTableRow[]
}

export const createFakeOrdersStore = (initialOrders: OrderTableRow[]) => {
  let state: FakeOrdersState = { orders: initialOrders }

  const set = (
    partial:
      | Partial<FakeOrdersState>
      | ((state: FakeOrdersState) => Partial<FakeOrdersState>),
  ): void => {
    const next = typeof partial === 'function' ? partial(state) : partial
    state = { ...state, ...next }
  }

  const get = (): FakeOrdersState => state
  const getOrders = (): OrderTableRow[] => state.orders

  const findOrder = (orderNumber: string): OrderTableRow | undefined =>
    state.orders.find((order) => order.orderNumber === orderNumber)

  return { set, get, getOrders, findOrder }
}
