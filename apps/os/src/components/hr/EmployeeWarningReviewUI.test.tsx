import React from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { AttendanceReviewQueue } from './AttendanceReviewQueue'
import { useHrStore } from '../../store/hrStore'
import { useUserStore } from '../../store/userStore'
import { useOrdersStore } from '../../store/ordersStore'
import type { Employee } from '../../store/hrStoreTypes'

const employee: Employee = {
  id: 'employee-1',
  name: 'Rina',
  position: 'Florist',
  branch: 'Kedamaian',
  systemRole: 'florist',
  status: 'active',
  phone: '',
  hireDate: '2025-01-01',
}

const initialHr = useHrStore.getState()
const initialOrders = useOrdersStore.getState()

afterEach(() => cleanup())

beforeEach(() => {
  useUserStore.setState({ employeeId: 'hr-1', username: 'hr', role: 'hr', name: 'Star' })
  useOrdersStore.setState({ ...initialOrders, orders: [] })
  useHrStore.setState({
    ...initialHr,
    employees: [employee],
    attendance: [],
    attendanceReviewCases: [{
      id: 'warning-1',
      attendanceId: 'attendance-1',
      employeeId: employee.id,
      date: '2026-07-14',
      warningType: 'missing_check_out',
      status: 'pending',
      reason: 'No checkout was recorded.',
      createdAt: '2026-07-14T10:00:00.000Z',
    }],
    employeePointEntries: [],
  })
})

describe('employee warning review UI', () => {
  it('shows yellow warning labels and only the two simple review choices', () => {
    render(<AttendanceReviewQueue />)

    const warningLabel = screen.getByText('Missing checkout')
    expect(warningLabel.className).toContain('bg-warning/10')

    fireEvent.click(screen.getByRole('button', { name: 'Review' }))
    expect(screen.getByRole('button', { name: 'Mark solved' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Record as Problem' })).toBeInTheDocument()
    expect(screen.queryByText('Propose minus points')).not.toBeInTheDocument()
  })

  it('escalates a warning for the independent Reports Problem List', () => {
    render(<AttendanceReviewQueue />)

    fireEvent.click(screen.getByRole('button', { name: 'Review' }))
    expect(screen.getByText('Review note · Optional')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Record as Problem' }))

    expect(useHrStore.getState().attendanceReviewCases[0].status).toBe('problem')
    expect(screen.queryByRole('button', { name: /Problem List/ })).not.toBeInTheDocument()
    expect(screen.getByText(/Reports → Problem List/)).toBeInTheDocument()
  })
})
