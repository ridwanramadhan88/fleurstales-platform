import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { useUiLanguage } from '../../i18n/uiLanguage'
import { LanguageToggle } from './language-toggle'

describe('LanguageToggle', () => {
  beforeEach(() => {
    window.localStorage.clear()
    useUiLanguage.setState({ language: 'id' })
  })

  it('shows plain ID and EN controls without an icon', async () => {
    const user = userEvent.setup()
    const { container } = render(<LanguageToggle />)

    expect(screen.getByRole('button', { name: 'Use ID' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Use EN' })).toHaveAttribute('aria-pressed', 'false')
    expect(container.querySelector('svg')).toBeNull()

    await user.click(screen.getByRole('button', { name: 'Use EN' }))
    expect(useUiLanguage.getState().language).toBe('en')
  })
})
