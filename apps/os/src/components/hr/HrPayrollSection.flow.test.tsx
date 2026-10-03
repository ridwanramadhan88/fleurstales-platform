import { fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { HrPayrollSection } from './HrPayrollSection'
import { useUserStore } from '../../store/userStore'

const originalRole = useUserStore.getState().role

describe('HR payroll as one flow (UX plan PR 6)', () => {
  afterEach(() => useUserStore.getState().setRole(originalRole))

  it('shows the three stages, with HR to act first', () => {
    useUserStore.getState().setRole('hr')
    render(<HrPayrollSection />)
    const stages = within(screen.getByRole('list', { name: 'Payroll stages' })).getAllByRole('listitem')
    expect(stages).toHaveLength(3)
    expect(stages[0]).toHaveAttribute('aria-current', 'step')
    expect(screen.getByText('Your turn')).toBeInTheDocument()
  })

  it('puts the main step first and keeps manual payees under "More"', () => {
    useUserStore.getState().setRole('hr')
    render(<HrPayrollSection />)
    const main = screen.getByRole('button', { name: 'Generate staff payroll' })
    const more = screen.getByRole('button', { name: 'More payroll actions' })
    expect(main.compareDocumentPosition(more) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Add manual payee/ })).not.toBeInTheDocument()
    fireEvent.keyDown(more, { key: 'Enter' })
    expect(screen.getByRole('menuitem', { name: 'Add manual payee' })).toBeInTheDocument()
  })

  it('lists only the checks that still need doing', () => {
    useUserStore.getState().setRole('hr')
    render(<HrPayrollSection />)
    const summary = screen.getByText(/^\d+ of 6 ready$/)
    const readiness = summary.closest('div')!.parentElement!
    // Nothing generated yet: coverage and calculations are open; passed checks are not listed.
    expect(within(readiness).getByText('Employee coverage')).toBeInTheDocument()
    expect(within(readiness).queryByText('No staff joined or left during this payroll period.')).not.toBeInTheDocument()
  })
})
