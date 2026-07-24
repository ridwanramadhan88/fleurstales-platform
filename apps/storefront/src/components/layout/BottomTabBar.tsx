/**
 * @file BottomTabBar.tsx
 * @description Compact role-aware mobile bottom navigation with at most four direct tabs.
 */

import type { FC } from 'react'
import type { AppTabId } from '../../config/appNavigation'
import type { BottomTabBarViewModel, BottomTabItem } from './BottomTabBarController'

export type BottomTabId =
  | 'dashboard'
  | 'orders'
  | 'finance'
  | 'revenue'
  | 'hr'
  | 'catalog'
  | 'stock'
  | 'customers'
  | 'hr-attendance'
  | 'hr-people'
  | 'hr-payroll'

export interface BottomTabBarProps {
  activeTab: AppTabId
  activeHrSection?: import('../hr/HrTabContentController').HrSection
  onTabChange: (tab: BottomTabId) => void
  /** Kept for shell compatibility; order creation now lives in the Orders page. */
  onOpenNewOrder?: () => void
}

export const BottomTabBar: FC<BottomTabBarViewModel> = ({
  activeBottomTab,
  onTabChange,
  visibleTabs,
}) => {
  const renderTab = (tab: BottomTabItem) => {
    const Icon = tab.icon
    const isActive = activeBottomTab === tab.id

    return (
      <button
        key={tab.id}
        type="button"
        onClick={() => onTabChange(tab.id)}
        className={`tap-scale flex min-h-[52px] min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-1.5 py-1.5 text-center transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/45 ${
          isActive
            ? 'bg-surface-selected text-primary-foreground'
            : 'text-muted-foreground hover:bg-muted/70 hover:text-foreground'
        }`}
        aria-label={tab.label}
        aria-current={isActive ? 'page' : undefined}
      >
        <Icon className="size-[21px]" strokeWidth={isActive ? 2.35 : 2} />
        <span className="w-full truncate text-[11px] font-semibold leading-none">
          {tab.label}
        </span>
      </button>
    )
  }

  return (
    <nav
      aria-label="Primary navigation"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-border/65 bg-surface-footer pb-[max(env(safe-area-inset-bottom),0px)] shadow-[0_-8px_24px_rgba(15,23,42,0.05)]"
    >
      <div
        className="mx-auto grid w-full max-w-md gap-1 px-3 py-2"
        style={{ gridTemplateColumns: `repeat(${Math.max(visibleTabs.length, 1)}, minmax(0, 1fr))` }}
      >
        {visibleTabs.map(renderTab)}
      </div>
    </nav>
  )
}
