import React from 'react'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { HrTabContentContainer } from './HrTabContentContainer'
import { useHrStore } from '../../store/hrStore'
import { useUserStore } from '../../store/userStore'
import type { Employee } from '../../store/hrStoreTypes'
const owner: Employee = { id:'owner-1', name:'Titi', position:'Owner', branch:'Kedamaian', systemRole:'owner', status:'active', phone:'', hireDate:'2024-01-01', username:'owner', pin:'123456' }
const staff: Employee = { id:'staff-1', name:'Rina', position:'Florist', branch:'Kedamaian', systemRole:'florist', status:'active', phone:'', hireDate:'2025-01-01', username:'rina', pin:'123456' }
afterEach(() => cleanup())
beforeEach(() => { useUserStore.setState({ employeeId:'hr-1', username:'hr', role:'hr', name:'Star' }); useHrStore.setState({ employees:[owner, staff], attendance:[] }) })
describe('employee details UI', () => {
  it('moves employee status action into details', () => {
    render(<HrTabContentContainer activeBranch="Kedamaian" />)
    const staffRow = screen.getByText('Rina').closest('article')!
    fireEvent.click(within(staffRow).getByRole('button', { name:'Details' }))
    fireEvent.click(screen.getByRole('button', { name:'Deactivate' }))
    fireEvent.click(screen.getByRole('button', { name:'Confirm' }))
    expect(useHrStore.getState().employees.find((item) => item.id === staff.id)?.status).toBe('inactive')
  })
  it('keeps protected Owner records out of the HR employee editor', () => {
    useHrStore.setState({ employees:[owner], attendance:[] })
    render(<HrTabContentContainer activeBranch="Kedamaian" />)
    expect(screen.queryByRole('button', { name:'Details' })).not.toBeInTheDocument()
    expect(screen.getByText('No employees match the selected filters.')).toBeInTheDocument()
  })
  it('lets owner edit role and keeps position equal to role', () => {
    useUserStore.setState({ employeeId:'owner-1', username:'owner', role:'owner', name:'Titi' })
    render(<HrTabContentContainer activeBranch="Kedamaian" />)
    const staffRow = screen.getByText('Rina').closest('article')!
    fireEvent.click(within(staffRow).getByRole('button', { name:'Details' }))
    fireEvent.change(screen.getByLabelText('Role / position'), { target:{ value:'admin' } })
    fireEvent.click(screen.getByRole('button', { name:'Save access' }))
    expect(screen.getByText(/Role: florist → admin/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name:'Confirm changes' }))
    expect(useHrStore.getState().employees.find((item) => item.id === staff.id)).toMatchObject({ systemRole:'admin', position:'Admin' })
  })
  it('shows field validation beside invalid profile fields', () => {
    render(<HrTabContentContainer activeBranch="Kedamaian" />)
    const staffRow = screen.getByText('Rina').closest('article')!
    fireEvent.click(within(staffRow).getByRole('button', { name:'Details' }))
    fireEvent.change(screen.getByLabelText('Name'), { target:{ value:'' } })
    fireEvent.click(screen.getByRole('button', { name:'Save profile' }))
    expect(screen.getByText('Employee name is required.')).toBeInTheDocument()
  })
  it('protects unsaved employee detail changes before closing', () => {
    render(<HrTabContentContainer activeBranch="Kedamaian" />)
    const staffRow = screen.getByText('Rina').closest('article')!
    fireEvent.click(within(staffRow).getByRole('button', { name:'Details' }))
    fireEvent.change(screen.getByLabelText('Name'), { target:{ value:'Rina Updated' } })
    fireEvent.click(screen.getAllByText('Close')[0].closest('button')!)
    expect(screen.getByText('Discard unsaved employee changes?')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name:'Keep editing' }))
    expect(screen.getByDisplayValue('Rina Updated')).toBeInTheDocument()
    fireEvent.click(screen.getAllByText('Close')[0].closest('button')!)
    fireEvent.click(screen.getByRole('button', { name:'Discard changes' }))
    expect(screen.queryByText('Employee details')).not.toBeInTheDocument()
  })

})
