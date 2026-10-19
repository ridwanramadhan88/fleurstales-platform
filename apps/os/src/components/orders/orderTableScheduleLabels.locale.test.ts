import { afterEach, describe, expect, it } from 'vitest'
import { useUiLanguage } from '../../i18n/uiLanguage'
import { formatOrderCreatedAtLabel } from './orderTableScheduleLabels'

describe('formatOrderCreatedAtLabel locale', () => {
  afterEach(() => useUiLanguage.setState({ language: 'id' }))

  it('uses Indonesian month names when the UI is Indonesian', () => {
    useUiLanguage.setState({ language: 'id' })
    expect(formatOrderCreatedAtLabel('18 Oct 2026 · 21:36')).toMatch(/^18 Okt 2026 · 21:36$/)
  })

  it('keeps English month names when the UI is English', () => {
    useUiLanguage.setState({ language: 'en' })
    expect(formatOrderCreatedAtLabel('18 Oct 2026 · 21:36')).toBe('18 Oct 2026 · 21:36')
  })
})
