import React from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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
    expect(screen.getByRole('button', { name: 'Confirm record' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Correct attendance' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Record as Problem' })).not.toBeInTheDocument()
    expect(screen.queryByText('Propose minus points')).not.toBeInTheDocument()
  })

  it('opens the focused attendance correction flow', () => {
    const onCorrectAttendance = vi.fn()
    render(<AttendanceReviewQueue onCorrectAttendance={onCorrectAttendance} />)

    fireEvent.click(screen.getByRole('button', { name: 'Review' }))
    expect(screen.getByText('Review note · Optional')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Correct attendance' }))
    expect(onCorrectAttendance).toHaveBeenCalledWith('warning-1', employee.id, '2026-07-14')
    expect(useHrStore.getState().attendanceReviewCases[0].status).toBe('pending')
  })
})
