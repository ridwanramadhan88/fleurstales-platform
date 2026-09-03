import type './orders'

declare module './orders' {
  interface OrderTableRow {
    /** Finance-only manual lookup key. Persisted by a dedicated Finance RPC. */
    financeReferenceCode?: string
    /** Customer-facing reason when a pending storefront order is rejected. */
    cancellationReason?: string
    cancelledBy?: string
    cancelledAt?: string
  }
}

export {}
