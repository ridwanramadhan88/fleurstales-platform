import { fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import HomePage from './Home'
import { useUserStore } from '../store/userStore'

const originalRole = useUserStore.getState().role

describe('Finance menu', () => {
  afterEach(() => useUserStore.getState().setRole(originalRole))

  it('"Finance" opens on reconciliation, and Balances stays a tab', () => {
    useUserStore.getState().setRole('finance')
    render(<HomePage initialBranch="All" />)

    const modules = () => screen.getByRole('navigation', { name: 'Finance modules' })
    // Lands on reconciliation, Balances is still a tab.
    expect(within(modules()).getByRole('button', { name: 'Reconciliation' })).toHaveAttribute('aria-current', 'page')
    fireEvent.click(within(modules()).getByRole('button', { name: 'Balances' }))
    expect(within(modules()).getByRole('button', { name: 'Balances' })).toHaveAttribute('aria-current', 'page')

    // The menu item brings the user back to reconciliation.
    const menuItems = screen.getAllByRole('button', { name: /^Finance$/ })
    fireEvent.click(menuItems[0])

    expect(within(modules()).getByRole('button', { name: 'Reconciliation' })).toHaveAttribute('aria-current', 'page')
  })
})
