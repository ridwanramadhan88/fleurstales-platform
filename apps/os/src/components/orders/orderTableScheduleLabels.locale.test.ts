import { afterEach, describe, expect, it } from 'vitest'
import { useUiLanguage } from '../../i18n/uiLanguage'
import { formatOrderCreatedAtLabel } from './orderTableScheduleLabels'

describe('formatOrderCreatedAtLabel locale', () => {
  afterEach(() => useUiLanguage.setState({ language: 'id' }))

  it('uses Indonesian month names when the UI is Indonesian', () => {
    useUiLanguage.setState({ language: 'id' })
    const label = formatOrderCreatedAtLabel('18 Oct 2026 · 12:00')
    expect(label).toMatch(/ Okt 2026 · \d{2}:\d{2}$/)
    expect(label).not.toContain('Oct')
  })

  it('keeps English month names when the UI is English', () => {
    useUiLanguage.setState({ language: 'en' })
    expect(formatOrderCreatedAtLabel('18 Oct 2026 · 12:00')).toMatch(/ Oct 2026 · \d{2}:\d{2}$/)
  })
})
