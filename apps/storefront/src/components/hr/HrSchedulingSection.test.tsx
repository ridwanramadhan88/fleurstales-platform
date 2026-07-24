import React from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { HrTabContentContainer } from './HrTabContentContainer'
import { useUserStore } from '../../store/userStore'
import { useHrStore } from '../../store/hrStore'
import { useSettingsStore } from '../../store/settingsStore'
import { DEFAULT_OWNER_SETTINGS } from '../../domain/settings/defaultOwnerSettings'

afterEach(cleanup)
beforeEach(() => {
  useSettingsStore.setState({ ...structuredClone(DEFAULT_OWNER_SETTINGS), settingsHasUnsavedChanges:false })
  useHrStore.setState({ attendance:[], employeeDefaultSchedules:[], scheduleOverrides:[], weeklySchedulePublications:[] })
})

const openScheduling = () => fireEvent(window, new CustomEvent('hr-open-section', { detail:{ section:'scheduling' } }))

describe('HR Scheduling UI', () => {
  it('shows the simplified weekly schedule without staff defaults', () => {
    useUserStore.setState({ employeeId:'emp-star', username:'hr', role:'hr', name:'Star' })
    render(<HrTabContentContainer activeBranch="All" />)
    openScheduling()
    expect(screen.getByRole('heading', { name:'Scheduling' })).toBeInTheDocument()
    expect(screen.getByText('Create, review, and publish weekly staff schedules.')).toBeInTheDocument()
    expect(screen.queryByText('Staff defaults')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name:'Generate new pattern' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name:'More scheduling actions' }))
    expect(screen.getByRole('button', { name:'Export PDF' })).toBeInTheDocument()
  })

  it('keeps the weekly grid dimensions stable and removes the outer left gap', () => {
    useUserStore.setState({ employeeId:'emp-star', username:'hr', role:'hr', name:'Star' })
    const { container } = render(<HrTabContentContainer activeBranch="All" />)
    openScheduling()
    const table = Array.from(container.querySelectorAll('table')).find((item) => item.classList.contains('w-[1042px]'))
    expect(table).toBeInTheDocument()
    expect(table).toHaveClass('table-fixed', 'border-spacing-0')
    const gridShell = table?.parentElement?.parentElement
    expect(gridShell).toHaveClass('w-full')
    expect(gridShell).not.toHaveClass('-mx-4')
    const columns = Array.from(table?.querySelectorAll('col') ?? [])
    expect(columns.some((item) => item.classList.contains('w-[148px]'))).toBe(true)
    expect(columns.filter((item) => item.classList.contains('w-[112px]'))).toHaveLength(7)
    expect(columns.some((item) => item.classList.contains('w-[110px]'))).toBe(true)
    expect(screen.getByRole('button', { name:'Generate new pattern' }).parentElement).toHaveClass('md:flex')
  })

  it('uses one compact mobile week control without weekday or branch text', () => {
    useUserStore.setState({ employeeId:'emp-star', username:'hr', role:'hr', name:'Star' })
    render(<HrTabContentContainer activeBranch="All" />)
    openScheduling()
    const thisWeek = screen.getByRole('button', { name:/This week/ })
    expect(thisWeek).toHaveTextContent('This week')
    expect(thisWeek).toHaveTextContent(/\d{2} \w{3} – \d{2} \w{3}/)
    expect(thisWeek).not.toHaveTextContent('Mon')
    expect(thisWeek).not.toHaveTextContent('Sun')
    expect(thisWeek).not.toHaveTextContent('All branches')
    expect(thisWeek).toHaveClass('h-11', 'min-w-0', 'overflow-hidden')
  })

  it('labels only nearby weeks contextually and never calls a distant week This week', () => {
    useUserStore.setState({ employeeId:'emp-star', username:'hr', role:'hr', name:'Star' })
    render(<HrTabContentContainer activeBranch="All" />)
    openScheduling()

    expect(screen.getByRole('button', { name:/This week/ })).toBeInTheDocument()
    fireEvent.click(screen.getByLabelText('Next week'))
    expect(screen.getByText('Next week')).toBeInTheDocument()
    fireEvent.click(screen.getByLabelText('Next week'))
    expect(screen.queryByRole('button', { name:/This week/ })).not.toBeInTheDocument()
    expect(screen.queryByText('Next week')).not.toBeInTheDocument()
  })

  it('hides the Coverage warnings card completely when minimum coverage is met', () => {
    useSettingsStore.setState((state) => ({
      scheduling: { ...state.scheduling, minimumCoverage: { admin: 0, florist: 0 } },
      schedulingConfigRevisions: [],
    }))
    useUserStore.setState({ employeeId:'emp-star', username:'hr', role:'hr', name:'Star' })
    render(<HrTabContentContainer activeBranch="All" />)
    openScheduling()

    expect(screen.queryByRole('heading', { name:'Coverage warnings' })).not.toBeInTheDocument()
    expect(screen.queryByText(/Minimum coverage is met/)).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name:'Assignment suggestions' })).toBeInTheDocument()
  })

  it('allows an Admin with view access to see schedules without publish controls', () => {
    useSettingsStore.setState((state) => ({ permissions:{ ...state.permissions, admin:{ ...state.permissions.admin, scheduling:'view' } } }))
    useUserStore.setState({ employeeId:'emp-akbar', username:'akbar', role:'admin', name:'Akbar' })
    render(<HrTabContentContainer activeBranch="Kedamaian" />)
    expect(screen.getByRole('heading', { name:'Scheduling' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name:'Publish' })).not.toBeInTheDocument()
  })
  it('keeps mobile summaries in one horizontal row and secondary actions inside More', () => {
    useUserStore.setState({ employeeId:'emp-star', username:'hr', role:'hr', name:'Star' })
    const { container } = render(<HrTabContentContainer activeBranch="All" />)
    openScheduling()
    const staffCard = screen.getByText('Staff').closest('article')
    expect(staffCard).toHaveClass('w-[112px]', 'min-w-[112px]', 'snap-start')
    expect(screen.queryByRole('button', { name:'Export PDF' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name:'More scheduling actions' }))
    expect(screen.getByRole('button', { name:'Export PDF' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name:'Copy previous week' })).toBeInTheDocument()
    expect(container.querySelector('[aria-label="Show weekly grid"]')).toHaveTextContent('Grid')
  })

})
