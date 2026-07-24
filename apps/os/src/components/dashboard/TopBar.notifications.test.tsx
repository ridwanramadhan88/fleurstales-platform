import React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { TopBar } from './TopBar'
import type { TopBarViewModel } from './TopBarController'

const makeViewModel = (notificationCount: number, branchMenuOpen = false): TopBarViewModel =>
  ({
    activeBranch: 'All',
    notificationCount,
    onOpenNotifications: vi.fn(),
    searchQuery: '',
    searchPlaceholder: '',
    searchEnabled: false,
    showSearch: false,
    today: 'Thu, Jul 9',
    branches: ['All', 'Kedamaian', 'Pahoman'],
    userName: 'Titi',
    roleLabel: 'Owner',
    initials: 'TT',
    canSwitchBranch: true,
    branchDisplayLabel: 'All',
    branchMenuOpen,
    profileMenuOpen: false,
    branchMenuRef: { current: null },
    branchMenuPanelRef: { current: null },
    mobileBranchTriggerRef: { current: null },
    desktopBranchTriggerRef: { current: null },
    profileMenuRef: { current: null },
    onToggleBranchMenu: vi.fn(),
    onSelectBranch: vi.fn(),
    onToggleProfileMenu: vi.fn(),
    onSignOutFromProfile: vi.fn(),
  }) as TopBarViewModel

describe('TopBar notification badge', () => {
  it('shows the unread count and exposes it in the accessible name', () => {
    render(<TopBar {...makeViewModel(7)} />)
    expect(
      screen.getByRole('button', { name: 'Notifications, 7 unread' }),
    ).toBeInTheDocument()
    expect(screen.getByText('7')).toBeInTheDocument()
  })

  it('hides the count when there are no unread notifications', () => {
    render(<TopBar {...makeViewModel(0)} />)
    expect(
      screen.getByRole('button', { name: 'Notifications' }),
    ).toBeInTheDocument()
  })

  it('renders the branch selector as a solid portalled overlay', () => {
    render(<TopBar {...makeViewModel(0, true)} />)
    const menu = screen.getByRole('listbox', { name: 'Branch' })
    expect(menu).toHaveClass('fixed', 'bg-surface-popover')
    expect(menu).not.toHaveClass('backdrop-blur-xl')
  })

})
