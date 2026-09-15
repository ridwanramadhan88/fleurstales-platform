export type FinanceReconciliationStatus = 'awaiting_review' | 'needs_correction' | 'reconciled'

export interface FinanceReconciliationOrderState {
  financeVerified?: boolean
  financeVerificationStatus?: string | null
}

export const getFinanceReconciliationStatus = (
  order: FinanceReconciliationOrderState,
): FinanceReconciliationStatus => {
  if (order.financeVerified) return 'reconciled'
  if (order.financeVerificationStatus === 'rejected') return 'needs_correction'
  return 'awaiting_review'
}

export const financeReconciliationPriority = (
  status: FinanceReconciliationStatus,
): number => {
  if (status === 'needs_correction') return 0
  if (status === 'awaiting_review') return 1
  return 2
}

export const jakartaMonthKeyFromTimestamp = (value: string): string => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(date)
  const year = parts.find((part) => part.type === 'year')?.value ?? ''
  const month = parts.find((part) => part.type === 'month')?.value ?? ''
  return year && month ? `${year}-${month}` : ''
}

export const formatFinanceReconciliationMonth = (monthKey: string): string => {
  if (!/^\d{4}-\d{2}$/.test(monthKey)) return monthKey
  const date = new Date(`${monthKey}-15T12:00:00+07:00`)
  if (Number.isNaN(date.getTime())) return monthKey
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Jakarta',
    month: 'long',
    year: 'numeric',
  }).format(date)
}
