import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { FinancePayrollScheduleAdjustment } from './FinancePayrollScheduleAdjustment'
import { usePayrollStore, type PayrollPeriod } from '../../store/payrollStore'
import { useUserStore } from '../../store/userStore'

const period:PayrollPeriod = { id:'payroll-2026-08', periodStart:'2026-07-21', periodEnd:'2026-08-20', hrSubmissionDeadline:'2026-08-24', financeReviewDeadline:'2026-08-27', paymentDate:'2026-08-28', status:'hr_preparation', createdAt:'2026-08-21T00:00:00.000Z', source:'owner_defaults' }
const originalEnsure = usePayrollStore.getState().ensureCurrentPeriod

beforeEach(() => {
  useUserStore.setState({ employeeId:'emp-dewi', name:'Dewi', username:'finance', role:'finance' })
  usePayrollStore.setState({ periods:[period], employeePayrolls:[], payrollScheduleAdjustments:[], ensureCurrentPeriod:() => period })
})

describe('FinancePayrollScheduleAdjustment', () => {
  it('shows direct Edit schedule without History or approval actions', () => {
    render(<FinancePayrollScheduleAdjustment />)
    expect(screen.getByRole('button', { name:'Edit schedule' })).toBeInTheDocument()
    expect(screen.getByText('28 Aug 2026')).toBeInTheDocument()
    expect(screen.queryByText(/History/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/Owner approval/i)).not.toBeInTheDocument()
  })
  it('opens a direct-edit drawer', () => {
    render(<FinancePayrollScheduleAdjustment />)
    fireEvent.click(screen.getByRole('button', { name:'Edit schedule' }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByRole('button', { name:'Save schedule' })).toBeInTheDocument()
  })
})

afterAll(() => usePayrollStore.setState({ ensureCurrentPeriod:originalEnsure }))
