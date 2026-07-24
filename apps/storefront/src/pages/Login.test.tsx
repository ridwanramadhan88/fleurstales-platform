import React from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LoginPage } from './Login'

afterEach(cleanup)

describe('username and PIN login', () => {
  it('signs in demo owner using owner / 123456', () => {
    const onSignIn = vi.fn()
    render(<LoginPage onSignIn={onSignIn} onVisitStorefront={() => {}} />)

    fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'owner' } })
    fireEvent.change(screen.getByLabelText('PIN'), { target: { value: '123456' } })
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(onSignIn).toHaveBeenCalledWith(expect.objectContaining({ username: 'owner', systemRole: 'owner' }))
  })

  it('rejects an invalid PIN', () => {
    render(<LoginPage onSignIn={() => {}} onVisitStorefront={() => {}} />)

    fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'admin' } })
    fireEvent.change(screen.getByLabelText('PIN'), { target: { value: '000000' } })
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(screen.getByRole('alert')).toHaveTextContent('Invalid username or PIN')
  })
})
