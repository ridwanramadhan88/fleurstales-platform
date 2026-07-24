import React from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { HrTabContentContainer } from './HrTabContentContainer'
import { todayIsoDate, useHrStore } from '../../store/hrStore'
import { useUserStore } from '../../store/userStore'
import type { Employee } from '../../store/hrStoreTypes'
const staff: Employee = { id:'staff-1', name:'Rina', position:'Employee', branch:'Kedamaian', systemRole:'florist', status:'active', phone:'', hireDate:'2025-01-01' }
afterEach(() => cleanup())
beforeEach(() => { useUserStore.setState({ employeeId:'hr-1', username:'hr', role:'hr', name:'Star' }); useHrStore.setState({ employees:[staff], attendance:[] }) })
const openAttendance = () => fireEvent(window, new CustomEvent('hr-open-section', { detail:{ section:'attendance' } }))
describe('separate attendance section', () => {
  it('records a dated attendance entry with a note and shows history', () => {
    render(<HrTabContentContainer activeBranch="Kedamaian" />)
    openAttendance()
    fireEvent.click(screen.getByRole('button', { name:'History' }))
    fireEvent.change(screen.getByLabelText('Attendance status'), { target:{ value:'late' } })
    fireEvent.change(screen.getByLabelText('Attendance note'), { target:{ value:'Traffic delay' } })
    fireEvent.click(screen.getByRole('button', { name:'Save attendance' }))
    expect(useHrStore.getState().attendance[0]).toMatchObject({ status:'late', note:'Traffic delay' })
    expect(screen.getAllByText('Traffic delay').length).toBeGreaterThan(0)
  })
  it('corrects the same employee and date instead of duplicating it', () => {
    const date = todayIsoDate()
    useHrStore.setState({ employees:[staff], attendance:[{ id:'a1', employeeId:staff.id, date, status:'absent', note:'Wrong', actor:'Star', createdAt:new Date().toISOString() }] })
    render(<HrTabContentContainer activeBranch="Kedamaian" />)
    openAttendance()
    fireEvent.click(screen.getByRole('button', { name:'History' }))
    fireEvent.change(screen.getByLabelText('Attendance status'), { target:{ value:'present' } })
    fireEvent.change(screen.getByLabelText('Attendance note'), { target:{ value:'Corrected' } })
    fireEvent.click(screen.getByRole('button', { name:'Save attendance' }))
    expect(useHrStore.getState().attendance).toHaveLength(1)
    expect(useHrStore.getState().attendance[0]).toMatchObject({ status:'present', note:'Corrected' })
  })
})
