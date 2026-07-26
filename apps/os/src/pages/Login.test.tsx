import React from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LoginPage } from './Login'

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
})
