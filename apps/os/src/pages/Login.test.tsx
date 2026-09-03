import React from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Employee } from '../store/hrStoreTypes'
import type { SharedStaffSession } from '../data/shared/staffSessionDomain'
import { LoginPage, reconcileSupabaseEmployeeRole } from './Login'

afterEach(cleanup)

describe('username and password login', () => {
  it('signs in local owner using owner / Fleur1', () => {
    const onSignIn = vi.fn()
    render(<LoginPage onSignIn={onSignIn} />)

    fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'owner' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'Fleur1' } })
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(onSignIn).toHaveBeenCalledWith(expect.objectContaining({ username: 'owner', systemRole: 'owner' }))
  })

  it('rejects an invalid password', () => {
    render(<LoginPage onSignIn={() => {}} />)

    fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'admin' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'Wrong1' } })
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(screen.getByRole('alert')).toHaveTextContent('Invalid username or password')
  })

  it('uses the fresh Supabase role when the stored employee role is stale', () => {
    const storedEmployee: Employee = {
      id: 'emp_zahra',
      name: 'Zahra Maheswari',
      position: 'Admin',
      branch: '',
      systemRole: 'admin',
      status: 'active',
      phone: '',
      hireDate: '2026-01-01',
      username: 'hrd',
      email: 'hrd.tjiptarasa@gmail.com',
    }
    const session: SharedStaffSession = {
      kind: 'staff',
      source: 'supabase',
      userId: 'auth-zahra',
      employeeId: 'emp_zahra',
      displayName: 'Zahra Maheswari',
      role: 'hr',
      username: 'hrd',
      email: 'hrd.tjiptarasa@gmail.com',
      isActive: true,
    }

    const resolvedEmployee = reconcileSupabaseEmployeeRole(storedEmployee, session)

    expect(resolvedEmployee.systemRole).toBe('hr')
    expect(storedEmployee.systemRole).toBe('admin')
  })
})
