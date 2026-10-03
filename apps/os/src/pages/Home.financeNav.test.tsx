import { fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import HomePage from './Home'
import { useUserStore } from '../store/userStore'

const originalRole = useUserStore.getState().role

describe('Finance menu', () => {
  afterEach(() => useUserStore.getState().setRole(originalRole))

  it('"Order Reconciliation" opens the reconciliation module, and Overview stays a tab', () => {
    useUserStore.getState().setRole('finance')
    render(<HomePage initialBranch="All" />)

    const modules = () => screen.getByRole('navigation', { name: 'Finance modules' })
    // Lands on reconciliation, Overview is still a tab.
    expect(within(modules()).getByRole('button', { name: 'Reconciliation' })).toHaveAttribute('aria-current', 'page')
    fireEvent.click(within(modules()).getByRole('button', { name: 'Overview' }))
    expect(within(modules()).getByRole('button', { name: 'Overview' })).toHaveAttribute('aria-current', 'page')

    // The menu item brings the user back to reconciliation.
    const menuItems = screen.getAllByRole('button', { name: /Order Reconciliation|Reconcile/ })
    fireEvent.click(menuItems[0])

    expect(within(modules()).getByRole('button', { name: 'Reconciliation' })).toHaveAttribute('aria-current', 'page')
  })
})
