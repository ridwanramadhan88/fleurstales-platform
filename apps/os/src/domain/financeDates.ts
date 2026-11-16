/**
 * @file financeDates.ts
 * @description The one place Finance turns timestamps into business dates.
 * Finance works in WIB (Asia/Jakarta) months: the LK report, period closing,
 * the ledger month filter, and the cash-flow summary all key on `YYYY-MM`.
 * Every Finance screen imports from here instead of re-deriving the month
 * with its own Intl formatter or device-timezone `setHours`.
 */

const monthPartsFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Jakarta',
  year: 'numeric',
  month: '2-digit',
})

const dayPartsFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Jakarta',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

const toDate = (value: string | Date): Date | null => {
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

const part = (parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes): string =>
  parts.find((item) => item.type === type)?.value ?? ''

/** `YYYY-MM` of a timestamp in WIB; '' for an invalid value. */
export const jakartaMonthKey = (value: string | Date = new Date()): string => {
  const date = toDate(value)
  if (!date) return ''
  const parts = monthPartsFormatter.formatToParts(date)
  const year = part(parts, 'year')
  const month = part(parts, 'month')
  return year && month ? `${year}-${month}` : ''
}

/** `YYYY-MM-DD` of a timestamp in WIB; '' for an invalid value. */
export const jakartaDateKey = (value: string | Date = new Date()): string => {
  const date = toDate(value)
  if (!date) return ''
  const parts = dayPartsFormatter.formatToParts(date)
  const year = part(parts, 'year')
  const month = part(parts, 'month')
  const day = part(parts, 'day')
  return year && month && day ? `${year}-${month}-${day}` : ''
}

/** Business timestamp of a ledger row: its transaction date, else creation. */
export const financeBusinessTimestamp = (transaction: { transactionDate?: string; createdAt: string }): string =>
  transaction.transactionDate ?? transaction.createdAt

/** Business month (`YYYY-MM`, WIB) of a ledger row. */
export const financeBusinessMonth = (transaction: { transactionDate?: string; createdAt: string }): string =>
  jakartaMonthKey(financeBusinessTimestamp(transaction))

/** Business day (`YYYY-MM-DD`, WIB) of a ledger row. */
export const financeBusinessDate = (transaction: { transactionDate?: string; createdAt: string }): string =>
  jakartaDateKey(financeBusinessTimestamp(transaction))

export const isMonthKey = (value: string): boolean => /^\d{4}-(0[1-9]|1[0-2])$/.test(value)

/** The month before `YYYY-MM`. */
export const previousMonthKey = (month: string): string => {
  const [year, monthIndex] = month.split('-').map(Number)
  const date = new Date(Date.UTC(year, monthIndex - 2, 1))
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
}

/** The month after `YYYY-MM`. */
export const nextMonthKey = (month: string): string => {
  const [year, monthIndex] = month.split('-').map(Number)
  const date = new Date(Date.UTC(year, monthIndex, 1))
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
}

/** `count` months ending at `latest` (default: the current WIB month), newest first. */
export const recentMonthKeys = (count: number, latest: string = jakartaMonthKey()): string[] => {
  const months: string[] = []
  let month = latest
  for (let index = 0; index < count; index += 1) {
    months.push(month)
    month = previousMonthKey(month)
  }
  return months
}

/** "November 2026" (en) / "November 2026" (id). */
export const formatMonthKey = (month: string, language: 'en' | 'id' = 'en'): string => {
  if (!isMonthKey(month)) return month
  const date = new Date(`${month}-15T12:00:00+07:00`)
  return new Intl.DateTimeFormat(language === 'id' ? 'id-ID' : 'en-US', {
    timeZone: 'Asia/Jakarta',
    month: 'long',
    year: 'numeric',
  }).format(date)
}

/** "16 Nov 2026" in WIB. */
export const formatFinanceDay = (value: string | Date, language: 'en' | 'id' = 'en'): string => {
  const date = toDate(value)
  if (!date) return typeof value === 'string' ? value : ''
  return new Intl.DateTimeFormat(language === 'id' ? 'id-ID' : 'en-GB', {
    timeZone: 'Asia/Jakarta',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date)
}

/** Whole days between a timestamp and now (0 for today or a future/invalid value). */
export const daysSince = (value: string | undefined, now: Date = new Date()): number => {
  if (!value) return 0
  const date = toDate(value)
  if (!date) return 0
  const start = Date.parse(`${jakartaDateKey(date)}T00:00:00+07:00`)
  const end = Date.parse(`${jakartaDateKey(now)}T00:00:00+07:00`)
  return Math.max(0, Math.round((end - start) / 86_400_000))
}
