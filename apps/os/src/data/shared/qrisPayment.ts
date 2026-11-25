/**
 * Amount-embedded QRIS per order (25 Nov 2026). The server is authoritative:
 * it builds each order's dynamic QRIS string (private.order_qris_payment).
 * This mirror of private.qris_amount_for only lets staff screens flag
 * "QR diperbarui" from the order row without another request.
 */

export interface QrisPayment {
  /** Dynamic QRIS string for this order (never the branch's static QRIS). */
  payload: string
  amountIdr: number
  billIdr: number
  uniqueDiscountIdr: number
  nmid: string
  branchName: string | null
  /** The bill changed after this order's QR was handed out. */
  amountUpdated: boolean
}

const DAILY_ORDER_NUMBER = /^[A-Z0-9]+-\d{2}-\d{2}-\d{2}-(\d{3})$/

/**
 * Largest amount <= bill ending in the order's 3-digit daily code. Bills
 * under Rp10.000, legacy numbers and 4-digit sequences are paid exactly.
 */
export const qrisAmountFor = (orderNumber: string, billIdr: number): number => {
  const bill = Math.max(0, Math.trunc(billIdr))
  if (bill < 10000) return bill
  const match = DAILY_ORDER_NUMBER.exec(orderNumber)
  if (!match) return bill
  const amount = Math.floor(bill / 1000) * 1000 + Number(match[1])
  return amount > bill ? amount - 1000 : amount
}

/** True when an unpaid QRIS order's bill changed after its QR was handed out. */
export const isQrisAmountUpdated = (input: {
  orderNumber: string
  totalIdr: number
  paidAmountIdr: number
  qrisAmountShown: number | null | undefined
}): boolean =>
  input.qrisAmountShown != null &&
  input.qrisAmountShown !== qrisAmountFor(input.orderNumber, input.totalIdr - input.paidAmountIdr)
