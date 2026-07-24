/**
 * @file gap-log.pairing.test.ts
 * @description Executable companion to gap-log.md. Each `describe` block is
 * named after its gap-log entry number and asserts the CURRENT behavior —
 * including explicitly documented open behavior where a product decision is
 * still pending. Resolved entries assert the shipped rule so a later change
 * must update both the test and the gap-log resolution note.
 *
 * Not every entry belongs here. Product/trust-boundary decisions without a
 * stable executable rule are documented in gap-log.md's coverage table.
 *
 * Run with: npx vitest run docs/business-rules/gap-log.pairing.test.ts
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { makeOrder } from '../../src/test/factories/order'
import { useOrdersStore } from '../../src/store/ordersStore'
import { useStockStore } from '../../src/store/stockStore'
import { useSettingsStore } from '../../src/store/settingsStore'
import { useFinanceStore } from '../../src/store/financeStore'
import { transitionOrderStatus } from '../../src/domain/orderStatusTransitionDomain'

const ordersOriginal = useOrdersStore.getState()
const stockOriginal = {
  ...useStockStore.getState(),
  items: [
    { id:'test-arrangement', name:'Test Arrangement', branch:'Kedamaian', category:'Arrangement', subCategory:'fresh_flower', availableQty:10, reservedQty:0, unit:'pieces', lowStockThreshold:2, isPerishable:true, expiryDate:'2026-07-20' },
    { id:'test-rose', name:'Test Rose', branch:'Kedamaian', category:'Flowers', availableQty:20, reservedQty:0, unit:'stems', lowStockThreshold:5, isPerishable:true, expiryDate:'2026-07-20' },
  ] as import('../../src/store/stockStoreTypes').StockItem[],
  transfers: [],
}
const financeOriginal = useFinanceStore.getState()


beforeEach(() => {
  useSettingsStore.getState().updateStoreProfile({ inventoryEnabled: true })
  useStockStore.setState({ items: structuredClone(stockOriginal.items), transfers: [], events: [] })
})

afterEach(() => {
  useOrdersStore.setState({
    orders: ordersOriginal.orders,
    lastSequence: ordersOriginal.lastSequence,
  })
  useStockStore.setState({ items: stockOriginal.items, transfers: stockOriginal.transfers })
  useFinanceStore.setState({ transactions: financeOriginal.transactions })
})

describe('§1 — order-status transitions are guarded (resolved 2026-07-10)', () => {
  it('blocks a jump that skips the fulfillment pipeline', () => {
    const result = transitionOrderStatus({
      order: makeOrder({ status: 'pending_verification', fulfillment: 'delivery' }),
      nextStatus: 'delivered',
      actor: { name: 'Admin A', role: 'admin' },
      source: 'workflow',
      canEditOrders: true,
      transitionedAt: '2026-07-10T00:00:00.000Z',
    })

    expect(result).toMatchObject({ allowed: false, code: 'ILLEGAL_TRANSITION' })
  })

  it('blocks reopening a terminal order without an exact Undo descriptor', () => {
    const result = transitionOrderStatus({
      order: makeOrder({ status: 'cancelled' }),
      nextStatus: 'processing',
      actor: { name: 'Admin A', role: 'admin' },
      source: 'workflow',
      canEditOrders: true,
      transitionedAt: '2026-07-10T00:00:00.000Z',
    })

    expect(result).toMatchObject({ allowed: false, code: 'TERMINAL_STATUS' })
  })
})

describe('§22 (second half) — updatePayment now reconciles paidAmountIdr (resolved 2026-07-10)', () => {
  it('zeroes paidAmountIdr when moving to unpaid', () => {
    useOrdersStore.setState({
      orders: [
        makeOrder({ orderNumber: 'A', totalIdr: 200_000, paidAmountIdr: 200_000, paymentStatus: 'paid' }),
      ],
    })

    useOrdersStore.getState().updatePayment({
      orderNumber: 'A',
      expectedRevision: 1,
      paymentStatus: 'unpaid',
      actor: { name: 'Admin A', role: 'admin' },
    })

    const order = useOrdersStore.getState().orders.find((o) => o.orderNumber === 'A')
    expect(order?.paidAmountIdr).toBe(0)
  })

  it('clamps an explicit paidAmountIdr to totalIdr', () => {
    useOrdersStore.setState({
      orders: [makeOrder({ orderNumber: 'A', totalIdr: 100_000, paidAmountIdr: 0, paymentStatus: 'unpaid' })],
    })

    useOrdersStore.getState().updatePayment({
      orderNumber: 'A',
      expectedRevision: 1,
      paymentStatus: 'paid',
      actor: { name: 'Admin A', role: 'admin' },
      paidAmountIdr: 999_999,
    })

    const order = useOrdersStore.getState().orders.find((o) => o.orderNumber === 'A')
    expect(order?.paidAmountIdr).toBe(100_000)
  })
})

describe('§4 — cancellation paths share the guarded status command (resolved 2026-07-10)', () => {
  it('allows a direct active-order cancellation through updateOrderStatus', () => {
    useOrdersStore.setState({
      orders: [makeOrder({ orderNumber: 'A', status: 'processing' })],
    })

    const result = useOrdersStore.getState().updateOrderStatus({
      orderNumber: 'A',
      expectedRevision: 1,
      status: 'cancelled',
      actor: { name: 'Admin A', role: 'admin' },
      source: 'workflow',
    })

    expect(result.allowed).toBe(true)
    expect(useOrdersStore.getState().orders[0].status).toBe('cancelled')
  })

  it('routes approved cancellation through transitionOrderStatus and clears the request', () => {
    useOrdersStore.setState({
      orders: [
        makeOrder({
          orderNumber: 'A',
          status: 'delivered',
          pendingChangeRequest: {
            id: 'chg_1',
            type: 'cancel',
            reason: 'test',
            requestedBy: 'Admin',
            requestedAt: new Date().toISOString(),
          },
        }),
      ],
    })

    const approved = useOrdersStore
      .getState()
      .approveChangeRequest({
        orderNumber: 'A',
        expectedRevision: 1,
        actor: { employeeId: 'owner-1', name: 'Owner A', role: 'owner' },
        note: 'Owner approved cancellation after review',
      })

    const order = useOrdersStore.getState().orders[0]
    expect(approved.allowed).toBe(true)
    expect(order.status).toBe('cancelled')
    expect(order.pendingChangeRequest).toBeUndefined()
  })
})

describe('§10 — submitting a change request no longer overwrites an existing one (resolved 2026-07-10)', () => {
  it('refuses a second submission while one is already pending, leaving the first intact', () => {
    useOrdersStore.setState({
      orders: [
        makeOrder({
          orderNumber: 'A',
          status: 'delivered',
          pendingChangeRequest: {
            id: 'chg_first',
            type: 'cancel',
            reason: 'first request',
            requestedBy: 'Admin',
            requestedAt: new Date().toISOString(),
          },
        }),
      ],
    })

    const submitted = useOrdersStore.getState().submitChangeRequest({
      orderNumber: 'A',
      type: 'edit',
      reason: 'second request',
      expectedRevision: 1,
      actor: { name: 'Owner', role: 'owner' },
    })

    expect(submitted.allowed).toBe(false)
    const order = useOrdersStore.getState().orders.find((o) => o.orderNumber === 'A')
    expect(order?.pendingChangeRequest?.reason).toBe('first request')
  })
})

describe('§11 — cancellation and refund remain separate decisions', () => {
  it('cancelling a paid order does not silently create a refund', () => {
    useOrdersStore.setState({
      orders: [makeOrder({ orderNumber: 'A', status: 'processing', paymentStatus: 'paid', paidAmountIdr: 200_000, totalIdr: 200_000 })],
    })

    const result = useOrdersStore.getState().updateOrderStatus({
      orderNumber: 'A',
      expectedRevision: 1,
      status: 'cancelled',
      actor: { name: 'Admin A', role: 'admin' },
      source: 'workflow',
    })

    expect(result.allowed).toBe(true)
    expect(useOrdersStore.getState().orders[0]).toMatchObject({
      status: 'cancelled',
      paymentStatus: 'paid',
      paidAmountIdr: 200_000,
    })
    expect(useFinanceStore.getState().transactions).toHaveLength(0)
  })
})

describe('§13 — order payment events post to the ledger and Finance verifies the existing row', () => {
  it('posts one pending payment transaction, then verifies and dates it by actual order completion', () => {
    const completedAt = '2026-07-16T10:30:00.000Z'
    useFinanceStore.setState({ transactions: [] })
    useOrdersStore.setState({
      orders: [makeOrder({
        orderNumber: 'A',
        status: 'confirmed',
        totalIdr: 200_000,
        paidAmountIdr: 0,
        paymentStatus: 'unpaid',
        financeVerified: false,
        revision: 1,
      })],
    })

    const paymentResult = useOrdersStore.getState().updatePayment({
      orderNumber: 'A',
      expectedRevision: 1,
      paymentStatus: 'paid',
      actor: { employeeId: 'owner-1', name: 'Owner A', role: 'owner' },
    })
    expect(paymentResult.allowed).toBe(true)

    const pending = useFinanceStore.getState().transactions
    expect(pending).toHaveLength(1)
    expect(pending[0]).toMatchObject({
      orderNumber: 'A',
      category: 'order_payment',
      source: 'order_payment',
      status: 'pending',
      amount: 200_000,
    })

    const paidOrder = useOrdersStore.getState().orders[0]
    useOrdersStore.setState({
      orders: [{ ...paidOrder, status: 'delivered', completedAt }],
    })
    const orderRevision = useOrdersStore.getState().orders[0].revision ?? 2
    const verificationResult = useOrdersStore.getState().verifyOrderFinance({
      orderNumber: 'A',
      expectedRevision: orderRevision,
      actor: { employeeId: 'finance-1', name: 'Finance Tester', role: 'finance' },
    })
    expect(verificationResult.allowed).toBe(true)

    const verified = useFinanceStore.getState().transactions
    expect(verified).toHaveLength(1)
    expect(verified[0]).toMatchObject({
      id: pending[0].id,
      status: 'verified',
      transactionDate: completedAt,
      groupType: 'order_day',
      groupKey: '2026-07-16',
    })
  })
})

describe('§19 — order-creation/edit validation is not re-checked at the store layer', () => {
  it('createOrder accepts a cash-paid delivery order despite validateNewOrderForm forbidding it', () => {
    const before = useOrdersStore.getState().orders.length

    useOrdersStore.getState().createOrder({
      customerName: '',
      customerWhatsappNumber: '',
      fulfillment: 'delivery',
      paymentMethod: 'cash',
      items: [],
      totalIdr: 0,
      depositAmount: 0,
      source: 'admin_created',
      branch: 'Kedamaian',
    } as never)

    // The store-level action has no rule rejecting this combination —
    // only the form component's validateNewOrderForm does.
    expect(useOrdersStore.getState().orders.length).toBe(before + 1)
  })
})

describe('§25 — updateItem now re-applies addItem\'s cross-field clearing rules (resolved 2026-07-10)', () => {
  it('clears a stale subCategory once category changes away from Arrangement/Bouquet', () => {
    const item = useStockStore.getState().items.find((i) => i.subCategory)
    expect(item).toBeDefined()
    if (!item) return

    useStockStore.getState().updateItem(item.id, { category: 'Vase' as never })

    const after = useStockStore.getState().items.find((i) => i.id === item.id)
    expect(after?.subCategory).toBeUndefined()
  })

  it('clears a stale expiryDate once isPerishable is toggled off', () => {
    const item = useStockStore.getState().items.find((i) => i.isPerishable && i.expiryDate)
    expect(item).toBeDefined()
    if (!item) return

    useStockStore.getState().updateItem(item.id, { isPerishable: false })

    const after = useStockStore.getState().items.find((i) => i.id === item.id)
    expect(after?.expiryDate).toBeUndefined()
  })
})

describe('§21 — "cash disallowed for delivery" now has one shared implementation (resolved 2026-07-10)', () => {
  it('validateNewOrderForm rejects cash + delivery via the shared domain function', async () => {
    const { validateNewOrderForm } = await import(
      '../../src/components/orders/useNewOrderValidation'
    )
    const errors = validateNewOrderForm({
      customerName: 'Test',
      customerWhatsappNumber: '0812',
      customerEmail: '',
      customerBirthday: '',
      promoCode: '',
      orderItemMode: 'custom',
      orderItemCatalogId: '',
      orderItemCustomName: 'Bouquet',
      orderItemCustomPrice: '100000',
      orderType: 'walk_in',
      fulfillmentType: 'delivery',
      deliveryDate: '',
      deliveryTime: '',
      pickupDate: '',
      pickupTime: '',
      deliveryAddress: '',
      deliveryInstructions: '',
      deliveryFee: '',
      greetingMessage: '',
      greetingCardName: '',
      paymentMethod: 'cash',
      paymentStatus: 'paid',
      depositAmount: '',
      orderNote: '',
    })

    expect(errors.paymentMethod).toBe('Delivery orders must be paid by bank transfer.')
  })
})

describe('§26 — branch transfers now move quantity (resolved 2026-07-10)', () => {
  it('requestTransfer deducts availableQty from the source branch immediately', () => {
    const item = stockOriginal.items[0]
    const before = item.availableQty

    useStockStore.getState().requestTransfer({
      itemId: item.id,
      fromBranch: item.branch,
      toBranch: item.branch === 'Kedamaian' ? 'Pahoman' : 'Kedamaian',
      quantity: 1,
      actor: 'Test Actor',
    } as never)

    const after = useStockStore.getState().items.find((i) => i.id === item.id)?.availableQty
    expect(after).toBe(before - 1)
  })

  it("updateTransferStatus('cancelled') restores the deducted quantity to the source", () => {
    const item = stockOriginal.items[0]
    const before = item.availableQty
    const toBranch = item.branch === 'Kedamaian' ? 'Pahoman' : 'Kedamaian'

    useStockStore.getState().requestTransfer({
      itemId: item.id,
      fromBranch: item.branch,
      toBranch,
      quantity: 1,
      actor: 'Test Actor',
    } as never)
    const transferId = useStockStore.getState().transfers[0].id

    useStockStore.getState().updateTransferStatus({
      transferId,
      status: 'cancelled',
      actor: 'Test Actor',
    } as never)

    const after = useStockStore.getState().items.find((i) => i.id === item.id)?.availableQty
    expect(after).toBe(before)
  })
})

describe('§28 — stock-transfer terminal reversals are blocked (resolved 2026-07-10)', () => {
  it('keeps received terminal and does not restore the source on a cancelled write', () => {
    const item = stockOriginal.items[0]
    expect(item).toBeDefined()
    if (!item) return

    const before = item.availableQty
    const toBranch = item.branch === 'Kedamaian' ? 'Pahoman' : 'Kedamaian'

    useStockStore.getState().requestTransfer({
      itemId: item.id,
      fromBranch: item.branch,
      toBranch,
      quantity: 1,
      actor: 'Test Actor',
    } as never)
    const transferId = useStockStore.getState().transfers[0].id
    useStockStore.getState().updateTransferStatus({
      transferId,
      status: 'in_transit',
      actor: 'Test Actor',
    })
    useStockStore.getState().updateTransferStatus({
      transferId,
      status: 'received',
      actor: 'Test Actor',
    })
    const eventCountBeforeBlockedWrite = useStockStore.getState().events.length

    useStockStore.getState().updateTransferStatus({
      transferId,
      status: 'cancelled',
      actor: 'Test Actor',
    })

    const state = useStockStore.getState()
    expect(state.transfers[0].status).toBe('received')
    expect(state.items.find((candidate) => candidate.id === item.id)?.availableQty).toBe(before - 1)
    expect(state.events).toHaveLength(eventCountBeforeBlockedWrite)
  })

  it('keeps cancelled terminal and does not credit the destination on a received write', () => {
    const item = stockOriginal.items[0]
    expect(item).toBeDefined()
    if (!item) return

    const before = item.availableQty
    const toBranch = item.branch === 'Kedamaian' ? 'Pahoman' : 'Kedamaian'

    useStockStore.getState().requestTransfer({
      itemId: item.id,
      fromBranch: item.branch,
      toBranch,
      quantity: 1,
      actor: 'Test Actor',
    } as never)
    const transferId = useStockStore.getState().transfers[0].id
    useStockStore.getState().updateTransferStatus({
      transferId,
      status: 'cancelled',
      actor: 'Test Actor',
    })
    const itemsBeforeBlockedWrite = useStockStore.getState().items
    const eventCountBeforeBlockedWrite = useStockStore.getState().events.length

    useStockStore.getState().updateTransferStatus({
      transferId,
      status: 'received',
      actor: 'Test Actor',
    })

    const state = useStockStore.getState()
    expect(state.transfers[0].status).toBe('cancelled')
    expect(state.items.find((candidate) => candidate.id === item.id)?.availableQty).toBe(before)
    expect(state.items).toEqual(itemsBeforeBlockedWrite)
    expect(state.events).toHaveLength(eventCountBeforeBlockedWrite)
  })
})

