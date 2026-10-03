import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { PayrollStageTrack, getPayrollStageIndex, getPayrollTurnLabel } from './PayrollStageTrack'

describe('payroll stage track (UX plan PR 6)', () => {
  it('maps each proposal status to one stage', () => {
    expect(getPayrollStageIndex(undefined)).toBe(0)
    expect(getPayrollStageIndex('draft')).toBe(0)
    expect(getPayrollStageIndex('returned_to_hr')).toBe(0)
    expect(getPayrollStageIndex('submitted_to_finance')).toBe(1)
    expect(getPayrollStageIndex('finance_approved')).toBe(2)
    expect(getPayrollStageIndex('paid')).toBe(3)
  })

  it('tells each role whose turn it is', () => {
    expect(getPayrollTurnLabel('draft', 'hr')).toBe('Your turn')
    expect(getPayrollTurnLabel('draft', 'finance')).toBe('Waiting for HR')
    expect(getPayrollTurnLabel('submitted_to_finance', 'hr')).toBe('Waiting for Finance')
    expect(getPayrollTurnLabel('submitted_to_finance', 'finance')).toBe('Your turn')
    expect(getPayrollTurnLabel('returned_to_hr', 'hr')).toBe('Your turn: corrections from Finance')
    expect(getPayrollTurnLabel('finance_approved', 'owner')).toBe('Your turn')
    expect(getPayrollTurnLabel('paid', 'hr')).toBe('Payroll paid')
  })

  it('shows all three stages and marks the current one', () => {
    render(<PayrollStageTrack status="submitted_to_finance" viewer="hr" />)
    const stages = screen.getAllByRole('listitem')
    expect(stages.map((stage) => stage.textContent)).toEqual(['1HR prepares', '2Finance reviews', '3Finance pays'].map((label, index) => index === 0 ? label.slice(1) : label))
    expect(stages[1]).toHaveAttribute('aria-current', 'step')
  })
})
