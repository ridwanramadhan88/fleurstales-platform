import { useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import {
  getAccessibleNavigationDestinationIds,
  type NavigationDestinationId,
} from '../../config/navigationGroups'
import { useUserStore, type UserRole } from '../../store/userStore'
import { useSettingsStore } from '../../store/settingsStore'
import { getBranchFilterOptions } from '../../domain/settings/settingsSelectors'
import type { BranchFilter } from '../../types/orders'
import type { DesktopSidebarProps } from './DesktopSidebar'

const getRoleLabel = (role: ReturnType<typeof useUserStore.getState>['role']) =>
  role === 'owner'
    ? 'Owner'
    : role === 'admin'
      ? 'Admin'
      : role === 'finance'
        ? 'Finance'
        : role === 'hr'
          ? 'HR'
          : role === 'florist'
            ? 'Florist'
            : 'Florist'

const getInitials = (name: string) =>
  name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

export interface DesktopSidebarViewModel extends DesktopSidebarProps {
  branches: readonly BranchFilter[]
  storeName: string
  storeLogoUrl?: string
  userName: string
  userRole: UserRole
  roleLabel: string
  initials: string
  branchMenuOpen: boolean
  branchMenuRef: RefObject<HTMLDivElement | null>
  canSwitchBranch: boolean
  visibleDestinationIds: NavigationDestinationId[]
  onToggleBranchMenu: () => void
  onSelectBranch: (branch: BranchFilter) => void
}

export const useDesktopSidebarController = ({
  onBranchChange,
  ...props
}: DesktopSidebarProps): DesktopSidebarViewModel => {
  const userRole = useUserStore((state) => state.role)
  const userName = useUserStore((state) => state.name)
  const storeProfile = useSettingsStore((state) => state.storeProfile)
  const storeName = storeProfile.storeName
  const settingsBranches = useSettingsStore((state) => state.branches)
  const permissions = useSettingsStore((state) => state.permissions)
  const [branchMenuOpen, setBranchMenuOpen] = useState(false)
  const branchMenuRef = useRef<HTMLDivElement | null>(null)

  const canSwitchBranch = true
  const visibleDestinationIds = getAccessibleNavigationDestinationIds({
    role: userRole,
    permissions,
    inventoryEnabled: storeProfile.inventoryEnabled,
    // Preserve the current desktop landing behavior for specialist roles.
    includeDashboard: userRole !== 'finance',
  })

  useEffect(() => {
    if (!branchMenuOpen) return

    const handleClickOutside = (event: MouseEvent) => {
      if (
        branchMenuRef.current &&
        !branchMenuRef.current.contains(event.target as Node)
      ) {
        setBranchMenuOpen(false)
      }
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setBranchMenuOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [branchMenuOpen])

  return {
    ...props,
    onBranchChange,
    branches: getBranchFilterOptions({ branches: settingsBranches }).filter((branch) =>
      (userRole === 'admin' || userRole === 'florist') ? branch !== 'All' : true,
    ),
    storeName,
    storeLogoUrl: storeProfile.logoUrl,
    userName,
    userRole,
    roleLabel: getRoleLabel(userRole),
    initials: getInitials(userName),
    branchMenuOpen,
    branchMenuRef,
    canSwitchBranch,
    visibleDestinationIds,
    onToggleBranchMenu: () => setBranchMenuOpen((open) => !open),
    onSelectBranch: (branch) => {
      onBranchChange(branch)
      setBranchMenuOpen(false)
    },
  }
}
