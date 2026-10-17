import { fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import HomePage from '../../pages/Home'
import { useUserStore, type UserRole } from '../../store/userStore'

const originalRole = useUserStore.getState().role

const menuLabels = (name: string) =>
  within(screen.getByRole('navigation', { name }))
    .getAllByRole('button')
    .map((button) => button.textContent?.trim())

describe('one menu (UX plan PR 8)', () => {
  afterEach(() => useUserStore.getState().setRole(originalRole))

  it.each<UserRole>(['owner', 'admin', 'finance', 'hr', 'florist'])(
    '%s sees the same menu items, with the same names, on phone and desktop',
    (role) => {
      useUserStore.getState().setRole(role)
      render(<HomePage initialBranch="All" />)
      const desktop = menuLabels('Primary')
      const phone = menuLabels('Primary navigation').filter((label) => label !== 'More')
      // The phone bar holds four pages; every other page is under "More".
      expect(phone.length).toBeLessThanOrEqual(4)
      expect(desktop).toEqual(expect.arrayContaining(phone))
      expect(desktop).toContain(phone[0])
    },
  )

  it('HR has one set of section names: the page tabs, not a second list in the sidebar', () => {
    useUserStore.getState().setRole('hr')
    render(<HomePage initialBranch="All" />)
    const sidebar = menuLabels('Primary')
    for (const section of ['Attendance', 'Scheduling', 'Employees', 'Reports', 'Payroll', 'Points']) {
      expect(sidebar).not.toContain(section)
    }
  })

  it('Finance can open its home screen on desktop too', () => {
    useUserStore.getState().setRole('finance')
    render(<HomePage initialBranch="All" />)
    expect(menuLabels('Primary')[0]).toBe('Overview')
  })

  it('phone: every page the bar cannot hold is under "More" (UX audit)', () => {
    useUserStore.getState().setRole('owner')
    render(<HomePage initialBranch="All" />)
    const bar = screen.getByRole('navigation', { name: 'Primary navigation' })
    fireEvent.click(within(bar).getByRole('button', { name: 'More' }))
    const sheet = screen.getByRole('dialog')
    const labels = within(sheet).getAllByRole('button').map((button) => button.textContent?.trim()).filter(Boolean)
    expect(labels).toEqual(expect.arrayContaining(['Catalog', 'Revenue', 'Settings']))
    fireEvent.click(within(sheet).getByRole('button', { name: 'Settings' }))
    expect(within(screen.getByRole('navigation', { name: 'Primary' })).getByRole('button', { name: 'Settings' })).toHaveAttribute('aria-current', 'page')
  })
})
