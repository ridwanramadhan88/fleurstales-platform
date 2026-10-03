import { afterEach, describe, expect, it } from 'vitest'
import { useUiLanguage } from '../i18n/uiLanguage'
import { formatHumanDate, formatHumanDateRange } from './humanDates'

describe('human dates', () => {
  afterEach(() => useUiLanguage.getState().setLanguage('id'))

  it('shows Indonesian dates staff can read', () => {
    useUiLanguage.getState().setLanguage('id')
    expect(formatHumanDate('2026-10-03')).toBe('3 Okt 2026')
    expect(formatHumanDateRange('2026-09-21', '2026-10-20')).toBe('21 Sep – 20 Okt 2026')
    expect(formatHumanDateRange('2025-12-21', '2026-01-20')).toBe('21 Des 2025 – 20 Jan 2026')
  })

  it('follows the UI language and leaves unknown values as they are', () => {
    useUiLanguage.getState().setLanguage('en')
    expect(formatHumanDate('2026-10-03')).toBe('3 Oct 2026')
    expect(formatHumanDate('soon')).toBe('soon')
  })
})
