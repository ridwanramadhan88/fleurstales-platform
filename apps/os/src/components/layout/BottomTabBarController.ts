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
  Settings,
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
  settings: Settings,
}

type DirectBottomTabId = Exclude<BottomTabId, 'settings'>

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
  /** Pages that do not fit in the bar; listed under "More". */
  moreTabs: BottomTabItem[]
  activeBottomTab: BottomTabId | 'more'
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

  const visibleIds = new Set<NavigationDestinationId>(visibleTabs.map((tab) => tab.id))
  const moreTabs = accessibleIds
    .filter((id) => !visibleIds.has(id))
    .map((id) => ({
      id: id as BottomTabId,
      label: getNavigationDestinationLabel(id, userRole, 'mobile-bottom'),
      icon: TAB_ICON[id as BottomTabId],
    }))
  const isMoreActive = moreTabs.some((tab) => tab.id === props.activeTab)
  const activeTab = isMoreActive ? props.activeTab : getBottomNavigationActiveTab(props.activeTab, visibleTabs)

  return {
    ...props,
    activeTab,
    activeBottomTab: isMoreActive ? 'more' : activeTab as BottomTabId,
    visibleTabs,
    moreTabs,
  }
}
