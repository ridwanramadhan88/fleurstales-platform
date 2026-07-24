import React from 'react'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { HrMonthlyReportSection } from './HrMonthlyReportSection'
import { useHrStore } from '../../store/hrStore'
import { useHrProblemStore } from '../../store/hrProblemStore'
import { useOrdersStore } from '../../store/ordersStore'
import { useSettingsStore } from '../../store/settingsStore'
import { useUserStore } from '../../store/userStore'
import { DEFAULT_OWNER_SETTINGS } from '../../domain/settings/defaultOwnerSettings'
import type { AttendanceReviewCase, Employee } from '../../store/hrStoreTypes'

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

const problemCase: AttendanceReviewCase = {
  id: 'case-1',
  attendanceId: 'attendance-1',
  employeeId: employee.id,
  date: '2026-07-14',
  warningType: 'missing_check_out',
  status: 'problem',
  reason: 'No checkout was recorded.',
  createdAt: '2026-07-14T10:00:00.000Z',
}

afterEach(cleanup)

beforeEach(() => {
  useSettingsStore.setState({ ...structuredClone(DEFAULT_OWNER_SETTINGS), settingsHasUnsavedChanges: false })
  useUserStore.setState({ employeeId: 'hr-1', username: 'hr', role: 'hr', name: 'Star' })
  useOrdersStore.setState({ orders: [] })
  useHrProblemStore.setState({ reviews: {} })
  useHrStore.setState({
    employees: [employee],
    attendance: [],
    attendanceReviewCases: [problemCase],
    employeeDefaultSchedules: [],
    scheduleOverrides: [],
    weeklySchedulePublications: [],
    scheduleRevisions: [],
    employeePointEntries: [],
  })
})

describe('HR attendance problem resolution', () => {
  it('ignores a stale mirrored attendance review when deriving open counts', () => {
    useHrProblemStore.setState({
      reviews: {
        'attendance:case-1': {
          problemId: 'attendance:case-1',
          status: 'solved',
          reviewedBy: 'Legacy HR',
          reviewedAt: '2026-07-15T10:00:00.000Z',
          resolvedAt: '2026-07-15T10:00:00.000Z',
        },
      },
    })

    render(<HrMonthlyReportSection activeBranch="All" />)

    expect(screen.getByRole('button', { name: 'Problem List · 1' })).toBeInTheDocument()
    const summary = screen.getAllByText('Open problems').map((item) => item.closest('article')).find(Boolean)
    expect(summary).not.toBeNull()
    expect(within(summary!).getByText('1')).toBeInTheDocument()
  })

  it('resolves the attendance case itself and refreshes both open counts without a mirror write', () => {
    render(<HrMonthlyReportSection activeBranch="All" />)

    expect(screen.getByRole('button', { name: 'Problem List · 1' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Problem List · 1' }))
    fireEvent.click(screen.getByRole('button', { name: 'View details' }))

    expect(screen.queryByRole('button', { name: 'Under review' })).not.toBeInTheDocument()
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Handled with the employee.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Mark solved' }))

    const resolved = useHrStore.getState().attendanceReviewCases.find((item) => item.id === 'case-1')
    expect(resolved?.status).toBe('resolved')
    expect(resolved?.reviewNote).toBe('Handled with the employee.')
    expect(resolved?.reviewedBy).toBe('Star')
    expect(useHrProblemStore.getState().reviews).toEqual({})
    expect(screen.getByRole('button', { name: 'Problem List · 0' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Overview' }))
    const summary = screen.getAllByText('Open problems').map((item) => item.closest('article')).find(Boolean)
    expect(summary).not.toBeNull()
    expect(within(summary!).getByText('0')).toBeInTheDocument()
  })
})
