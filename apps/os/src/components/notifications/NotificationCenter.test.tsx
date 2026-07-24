import React from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { NotificationCenter } from './NotificationCenter'

describe('NotificationCenter', () => {
  it('renders important tasks, marks all read, and opens a target', async () => {
    const user = userEvent.setup()
    const onMarkAllRead = vi.fn()
    const onOpenNotification = vi.fn()
    const item = {
      id: 'payment-1',
      title: 'Finance rejected KDM-1',
      message: 'Correction required',
      priority: 'warning' as const,
      createdAt: new Date().toISOString(),
      isRead: false,
      target: 'order' as const,
      orderNumber: 'KDM-1',
    }
    render(
      <NotificationCenter
        open
        onClose={vi.fn()}
        onMarkAllRead={onMarkAllRead}
        onOpenNotification={onOpenNotification}
        items={[item]}
      />,
    )

    expect(screen.getByText('Important tasks only.')).toBeInTheDocument()
    expect(screen.getByText('Today')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Mark all read' }))
    expect(onMarkAllRead).toHaveBeenCalledOnce()
    await user.click(screen.getByRole('button', { name: /Finance rejected KDM-1/i }))
    expect(onOpenNotification).toHaveBeenCalledWith(item)
  })
})
