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

  it('before payroll exists, readiness is a calm next step, not a red error list', () => {
    useUserStore.getState().setRole('hr')
    render(<HrPayrollSection />)
    const heading = screen.getByText('Payroll readiness')
    const readiness = heading.closest('div')!.parentElement!
    expect(within(readiness).getByText('Start with Generate staff payroll.')).toBeInTheDocument()
    // "Not generated yet" is not reported as a coverage or calculation problem.
    expect(within(readiness).queryByText('Employee coverage')).not.toBeInTheDocument()
    expect(within(readiness).queryByText('Calculations valid')).not.toBeInTheDocument()
    expect(readiness.className).not.toContain('destructive')
  })
})
