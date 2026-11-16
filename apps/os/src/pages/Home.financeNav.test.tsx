import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import HomePage from './Home'
import { useUserStore } from '../store/userStore'
import { useUiLanguage } from '../i18n/uiLanguage'
import { useFinanceUiStore } from '../components/finance/financeUiStore'

const originalRole = useUserStore.getState().role

describe('Finance menu', () => {
  beforeEach(() => {
    useUiLanguage.setState({ language: 'id' })
    useFinanceUiStore.getState().reset()
  })
  afterEach(() => useUserStore.getState().setRole(originalRole))

  it('"Finance" opens on Tasks, and the other tabs stay one tap away', () => {
    useUserStore.getState().setRole('finance')
    render(<HomePage initialBranch="All" />)

    const tabs = () => screen.getByRole('tablist', { name: 'Keuangan' })
    expect(within(tabs()).getByRole('tab', { name: /^Tugas/ })).toHaveAttribute('aria-selected', 'true')
    fireEvent.click(within(tabs()).getByRole('tab', { name: 'Kas & Transaksi' }))
    expect(within(tabs()).getByRole('tab', { name: 'Kas & Transaksi' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('combobox', { name: 'Bulan' })).toBeInTheDocument()

    // The menu item brings the user back to Tasks.
    const menuItems = screen.getAllByRole('button', { name: /^(Finance|Keuangan)$/ })
    fireEvent.click(menuItems[0])
    expect(within(tabs()).getByRole('tab', { name: /^Tugas/ })).toHaveAttribute('aria-selected', 'true')
  })

  it('switches tab when another screen asks for a Finance tab', () => {
    useUserStore.getState().setRole('finance')
    render(<HomePage initialBranch="All" />)
    act(() => {
      useFinanceUiStore.getState().requestFocus({ module: 'payroll', view: 'ready' })
    })
    expect(within(screen.getByRole('tablist', { name: 'Keuangan' })).getByRole('tab', { name: 'Penggajian' })).toHaveAttribute('aria-selected', 'true')
  })
})
