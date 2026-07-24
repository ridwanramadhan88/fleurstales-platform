import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { SettingsCenterContainer } from './SettingsCenterContainer'
import { useSettingsStore } from '../../store/settingsStore'
import { useUserStore } from '../../store/userStore'

beforeEach(() => {
  useSettingsStore.getState().resetSettings()
  useUserStore.getState().setRole('owner')
})

describe('Owner Settings read-only presentation', () => {
  it('does not expose editable settings controls before Edit is pressed', () => {
    render(<SettingsCenterContainer />)

    const sections = [
      'Store Profile',
      'Branches',
      'Payment Methods',
      'Staff & Roles',
      'Permissions',
      'Attendance',
      'Scheduling',
      'Payroll',
    ]

    for (const section of sections) {
      fireEvent.click(screen.getByRole('button', { name: section }))
      expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
      expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument()
      expect(screen.queryByRole('switch')).not.toBeInTheDocument()
      expect(screen.getByText(/^Read-only$/i)).toBeInTheDocument()
    }
  })

  it('reveals actual form controls only after entering Edit mode', () => {
    render(<SettingsCenterContainer />)

    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    expect(screen.queryByRole('switch')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))

    expect(screen.getAllByRole('textbox').length).toBeGreaterThan(0)
    expect(screen.queryByRole('switch', { name: 'Inventory enabled' })).not.toBeInTheDocument()
  })
})

describe('Owner Settings parent and sub-tab navigation', () => {
  it('opens the first sub-tab whenever a parent category is clicked', () => {
    render(<SettingsCenterContainer />)

    fireEvent.click(screen.getByRole('button', { name: 'People & Access' }))
    expect(screen.getByRole('button', { name: 'Staff & Roles' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('heading', { name: 'Staff & Roles' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Operations' }))
    expect(screen.getByRole('button', { name: 'Scheduling' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('heading', { name: 'Scheduling' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Business' }))
    expect(screen.getByRole('button', { name: 'Store Profile' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('heading', { name: 'Store Profile' })).toBeInTheDocument()
  })
})
