import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_OWNER_SETTINGS } from '../../domain/settings/defaultOwnerSettings'
import { PeopleMonthPeriodFields } from './PeoplePeriodControls'
import { CreateStaffSheet, PeoplePageHeader, PeopleTabs } from './PeopleWorkspaceUI'

const sections = ['employees', 'attendance', 'scheduling', 'reports', 'points', 'payroll'] as const

describe('People workspace shared UI', () => {
  it('keeps every People tab on the Employees-size navigation scale', () => {
    const onChange = vi.fn()
    render(<PeopleTabs sections={[...sections]} activeSection="attendance" onChange={onChange} />)

    const attendance = screen.getByRole('button', { name: 'Attendance' })
    expect(attendance.className).toContain('h-10')
    expect(attendance.className).toContain('text-sm')
    expect(attendance.querySelector('svg')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Reports' }))
    expect(onChange).toHaveBeenCalledWith('reports')
  })


  it('uses the same icon, heading and description system for each People page', () => {
    render(<PeoplePageHeader section="points" />)
    expect(screen.getByRole('heading', { name: 'Points' })).toBeInTheDocument()
    expect(screen.getByText('Review employee points, pending activity, and rules.')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Points' }).closest('header')?.querySelector('svg')).toBeInTheDocument()
  })

  it('combines the reporting month and calculated payroll period into compact navigation', () => {
    const onMonthChange = vi.fn()
    render(
      <PeopleMonthPeriodFields
        month="2026-07"
        onMonthChange={onMonthChange}
        settings={DEFAULT_OWNER_SETTINGS.payroll}
      />,
    )

    expect(screen.queryByText('Month')).not.toBeInTheDocument()
    expect(screen.queryByText('Period')).not.toBeInTheDocument()
    const periodControl = screen.getByRole('button', { name: 'Select month: July 2026' }).closest('[data-people-period-control]')
    expect(periodControl?.className).toContain('max-w-[520px]')
    expect(periodControl?.className).toContain('grid-cols-[44px_minmax(0,1fr)_44px]')
    expect(screen.getByRole('button', { name: 'Previous month' }).className).toContain('size-11')
    expect(screen.getByRole('button', { name: 'Next month' }).className).toContain('size-11')
    expect(screen.getByRole('button', { name: 'Select month: July 2026' })).toBeInTheDocument()
    expect(screen.getByText('July 2026')).toBeInTheDocument()
    expect(screen.getByText('· 21 Jun – 20 Jul')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Previous month' }))
    expect(onMonthChange).toHaveBeenCalledWith('2026-06')
    fireEvent.click(screen.getByRole('button', { name: 'Next month' }))
    expect(onMonthChange).toHaveBeenCalledWith('2026-08')
  })

  it('renders Create Staff as a focused sheet with a fixed action footer', () => {
    render(
      <CreateStaffSheet
        open
        onOpenChange={vi.fn()}
        onSubmit={(event) => event.preventDefault()}
        title="Create staff"
        description="Create a staff account."
        footer={<><button type="button">Cancel</button><button type="submit">Create employee</button></>}
      >
        <label>Name<input /></label>
      </CreateStaffSheet>,
    )

    const dialog = screen.getByRole('dialog')
    expect(dialog.className).toContain('mobile-focus-workflow')
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Create employee' })).toBeInTheDocument()
  })
})
