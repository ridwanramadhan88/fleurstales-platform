/**
 * @file humanDates.ts
 * @description One place to turn stored ISO dates ("2026-10-03") into what
 * staff read: "3 Okt 2026", "21 Sep – 20 Okt 2026". Follows the UI
 * language; an unparseable value is shown as it is.
 */

import { getDateLocale } from '../i18n/uiLanguage'

const parseIsoDate = (value: string): Date | null => {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value)
  if (!match) return null
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])))
}

const format = (date: Date, options: Intl.DateTimeFormatOptions): string =>
  new Intl.DateTimeFormat(getDateLocale(), { timeZone: 'UTC', ...options }).format(date)

/** "3 Okt 2026" (or "3 Oct 2026" in English). */
export const formatHumanDate = (value: string): string => {
  const date = parseIsoDate(value)
  return date ? format(date, { day: 'numeric', month: 'short', year: 'numeric' }) : value
}

/** "21 Sep – 20 Okt 2026"; the year is shown once when both dates share it. */
export const formatHumanDateRange = (start: string, end: string): string => {
  const from = parseIsoDate(start)
  const to = parseIsoDate(end)
  if (!from || !to) return `${start} – ${end}`
  const sameYear = from.getUTCFullYear() === to.getUTCFullYear()
  const left = format(from, sameYear ? { day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short', year: 'numeric' })
  return `${left} – ${format(to, { day: 'numeric', month: 'short', year: 'numeric' })}`
}
