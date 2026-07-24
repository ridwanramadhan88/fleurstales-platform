import type { FC } from 'react'
import {
  BarChart3,
  BookOpen,
  Boxes,
  Home,
  ReceiptText,
  ShieldCheck,
  Users,
  UserRoundCog,
  CalendarCheck2,
  UsersRound,
  WalletCards,
} from 'lucide-react'
import {
  getAccessibleNavigationDestinationIds,
  getNavigationDestinationLabel,
  type NavigationDestinationId,
} from '../../config/navigationGroups'
import { getPrimaryMobileDestinationIds } from '../../config/mobileNavigation'
import { useUserStore } from '../../store/userStore'
import { useSettingsStore } from '../../store/settingsStore'
import type { BottomTabBarProps, BottomTabId } from './BottomTabBar'

export interface BottomTabItem {
  id: BottomTabId
  label: string
  icon: FC<{ className?: string; strokeWidth?: number }>
}

const TAB_ICON: Record<BottomTabId, BottomTabItem['icon']> = {
  dashboard: Home,
  finance: ShieldCheck,
  revenue: BarChart3,
  hr: UserRoundCog,
  orders: ReceiptText,
  catalog: BookOpen,
  stock: Boxes,
  customers: Users,
  'hr-attendance': CalendarCheck2,
  'hr-people': UsersRound,
  'hr-payroll': WalletCards,
}

type DirectBottomTabId = Exclude<BottomTabId, 'hr-attendance' | 'hr-people' | 'hr-payroll'>

const isBottomTabId = (id: NavigationDestinationId): id is DirectBottomTabId =>
  id !== 'settings'

export const getVisibleBottomNavigationDestinationIds = (
  role: Parameters<typeof getPrimaryMobileDestinationIds>[0],
  accessibleIds: readonly NavigationDestinationId[],
): DirectBottomTabId[] => {
  const bottomAccessibleIds = accessibleIds.filter(isBottomTabId)
  return getPrimaryMobileDestinationIds(role, bottomAccessibleIds).filter(isBottomTabId)
}

export interface BottomTabBarViewModel extends BottomTabBarProps {
  visibleTabs: BottomTabItem[]
  activeBottomTab: BottomTabId
}


export const getBottomNavigationActiveTab = (
  activeTab: BottomTabBarProps['activeTab'],
  visibleTabs: readonly BottomTabItem[],
): BottomTabBarProps['activeTab'] =>
  visibleTabs.some((tab) => tab.id === activeTab)
    ? activeTab
    : visibleTabs.some((tab) => tab.id === 'dashboard')
      ? 'dashboard'
      : activeTab

export const useBottomTabBarController = (
  props: BottomTabBarProps,
): BottomTabBarViewModel => {
  const userRole = useUserStore((state) => state.role)
  const permissions = useSettingsStore((state) => state.permissions)
  const inventoryEnabled = useSettingsStore((state) => state.storeProfile.inventoryEnabled)

  if (userRole === 'hr') {
    const visibleTabs: BottomTabItem[] = [
      { id: 'dashboard', label: 'Overview', icon: TAB_ICON.dashboard },
      { id: 'hr-attendance', label: 'Attendance', icon: TAB_ICON['hr-attendance'] },
      { id: 'hr-people', label: 'People', icon: TAB_ICON['hr-people'] },
      { id: 'hr-payroll', label: 'Payroll', icon: TAB_ICON['hr-payroll'] },
    ]
    const section = props.activeHrSection ?? 'attendance'
    const activeBottomTab: BottomTabId = props.activeTab === 'dashboard'
      ? 'dashboard'
      : ['attendance', 'scheduling'].includes(section)
        ? 'hr-attendance'
        : ['employees', 'reports'].includes(section)
          ? 'hr-people'
          : 'hr-payroll'
    return { ...props, visibleTabs, activeBottomTab }
  }

  const accessibleIds = getAccessibleNavigationDestinationIds({
    role: userRole,
    permissions,
    inventoryEnabled,
  })

  const visibleTabs = getVisibleBottomNavigationDestinationIds(userRole, accessibleIds)
    .map((id) => ({
      id,
      label: getNavigationDestinationLabel(id, userRole, 'mobile-bottom'),
      icon: TAB_ICON[id],
    }))

  const activeTab = getBottomNavigationActiveTab(props.activeTab, visibleTabs)

  return {
    ...props,
    activeTab,
    activeBottomTab: activeTab as BottomTabId,
    visibleTabs,
  }
}
