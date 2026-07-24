/**
 * @file DesktopSidebar.tsx
 * @description Responsive left sidebar navigation for the Fleurstales dashboard on desktop screens.
 * Includes brand, branch selector, and primary navigation.
 */

import type { FC, ReactNode } from 'react'
import {
  LayoutDashboard,
  ShoppingBag,
  BookOpen,
  Boxes,
  Users2,
  Receipt,
  Clock3,
  BarChart3,
  Store,
  ChevronDown,
  Settings,
  CalendarCheck2,
  CalendarDays,
  UsersRound,
  FileBarChart,
  WalletCards,
  BadgeCent,
} from 'lucide-react'
import type { AppTabId } from '../../config/appNavigation'
import type { BranchFilter } from '../../types/orders'
import type { Theme } from '../../hooks/useTheme'
import type { DesktopSidebarViewModel } from './DesktopSidebarController'
import {
  getNavigationDestinationLabel,
  getNavigationGroupsForDestinations,
  type NavigationDestinationId,
} from '../../config/navigationGroups'
import { StoreBrandMark } from '../common/StoreBrandMark'

/**
 * @description Props for the desktop sidebar navigation.
 */
export interface DesktopSidebarProps {
  /** Currently active section. */
  activeTab: AppTabId
  /** Change the active section (kept in sync with Home + bottom tab bar). */
  onTabChange: (tab: AppTabId) => void
  activeHrSection?: import('../hr/HrTabContentController').HrSection
  onHrSectionChange?: (section: import('../hr/HrTabContentController').HrSection) => void
  /** Active branch filter. */
  activeBranch: BranchFilter
  /** Handler to switch active branch. */
  onBranchChange: (branch: BranchFilter) => void
  /**
   * @description Optional handler to sign out of the demo session and
   * return to the role-select login screen.
   */
  onSignOut?: () => void
  /** Current app theme; shown as a toggle in the user summary footer. */
  theme?: Theme
  /** Flips between light and dark theme. */
  onToggleTheme?: () => void
}

/**
 * @description Internal button component for navigation items in the sidebar, macOS source-list style.
 */
const getSidebarDestinationItem = (destination: NavigationDestinationId) => {
  const icons: Record<NavigationDestinationId, ReactNode> = {
    dashboard: <LayoutDashboard className="size-4" aria-hidden="true" />,
    orders: <ShoppingBag className="size-4" aria-hidden="true" />,
    customers: <Users2 className="size-4" aria-hidden="true" />,
    catalog: <BookOpen className="size-4" aria-hidden="true" />,
    stock: <Boxes className="size-4" aria-hidden="true" />,
    finance: <Receipt className="size-4" aria-hidden="true" />,
    revenue: <BarChart3 className="size-4" aria-hidden="true" />,
    hr: <Clock3 className="size-4" aria-hidden="true" />,
    settings: <Settings className="size-4" aria-hidden="true" />,
  }

  return { icon: icons[destination] }
}

const SidebarNavButton: FC<{
  label: string
  icon: ReactNode
  active?: boolean
  disabled?: boolean
  onClick?: () => void
}> = ({ label, icon, active = false, disabled = false, onClick }) => {
  const clickable = Boolean(onClick) && !disabled

  return (
    <button
      type="button"
      className={`group flex h-11 w-full items-center gap-2.5 whitespace-nowrap rounded-xl px-3 text-left text-sm font-medium transition-colors ${
        active
          ? 'bg-sidebar-accent text-foreground shadow-sm ring-1 ring-sidebar-border'
          : disabled
            ? 'cursor-not-allowed text-muted-foreground/40'
            : 'text-sidebar-foreground hover:bg-sidebar-accent/70 hover:text-foreground'
      }`}
      onClick={clickable ? onClick : undefined}
      disabled={disabled}
      aria-current={active ? 'page' : undefined}
    >
      <span
        className={`flex size-4 shrink-0 items-center justify-center ${
          active ? 'text-primary' : 'text-sidebar-foreground/75 group-hover:text-foreground'
        }`}
      >
        {icon}
      </span>
      <span className="truncate">{label}</span>
    </button>
  )
}

/**
 * @description Desktop-only left sidebar shell with brand, branch selector, and section navigation.
 */
export const DesktopSidebar: FC<DesktopSidebarViewModel> = ({
  activeTab,
  onTabChange,
  activeBranch,
  branches,
  storeName,
  storeLogoUrl,
  userName,
  roleLabel,
  initials,
  branchMenuOpen,
  branchMenuRef,
  canSwitchBranch,
  userRole,
  visibleDestinationIds,
  activeHrSection,
  onHrSectionChange,
  onToggleBranchMenu,
  onSelectBranch,
}) => {
  return (
    <aside className="sticky top-0 hidden h-screen w-[208px] shrink-0 self-start flex-col overflow-hidden border-r border-sidebar-border bg-sidebar-background px-3 py-4 text-sidebar-foreground md:flex lg:w-[224px] xl:w-[236px]">
      {/* Brand block */}
      <header className="mb-4 flex items-center gap-2 px-1">
        <StoreBrandMark logoUrl={storeLogoUrl} alt={`${storeName} logo`} className="size-8 rounded-lg" />
        <div className="leading-tight">
          <p className="font-display text-sm font-semibold text-foreground">
            {storeName}
          </p>
          <p className="text-2xs text-muted-foreground">Business OS</p>
        </div>
      </header>

      {/* Branch selector — compact dropdown trigger, consistent with the
          mobile header's branch control (icon trigger; options live in the
          popover instead of a full segmented row). */}
      <section className="relative mb-4" ref={branchMenuRef}>
        <button
          type="button"
          onClick={onToggleBranchMenu}
          disabled={!canSwitchBranch}
          className={`flex h-11 w-full items-center gap-2 whitespace-nowrap rounded-full border border-border/60 bg-transparent px-3 text-left transition ${
            canSwitchBranch ? 'hover:bg-muted/60' : 'cursor-not-allowed opacity-70'
          }`}
          aria-haspopup="listbox"
          aria-expanded={branchMenuOpen}
          aria-label={
            canSwitchBranch
              ? `Branch: ${activeBranch}`
              : `Branch: ${activeBranch} (locked — sign out to switch)`
          }
          title={canSwitchBranch ? undefined : 'Sign out and sign in again to switch branch'}
        >
          <Store className="h-[15px] w-[15px] shrink-0 text-muted-foreground/80" strokeWidth={2} />
          <span className="min-w-0 flex-1 truncate text-xs font-medium text-foreground">
            {activeBranch}
          </span>
          {canSwitchBranch && (
            <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
          )}
        </button>

        {canSwitchBranch && branchMenuOpen && (
          <div className="animate-pop-in absolute left-0 top-full z-30 mt-1.5 w-full rounded-xl border border-border/60 bg-surface-popover p-1 text-xs text-foreground shadow-lg">
            <p className="px-2.5 py-1 text-2xs font-semibold text-muted-foreground">
              Branch
            </p>
            {branches.map((branch) => (
              <button
                key={branch}
                type="button"
                onClick={() => onSelectBranch(branch)}
                className={`flex min-h-9 w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-xs transition hover:bg-accent ${
                  branch === activeBranch ? 'font-semibold text-primary' : ''
                }`}
              >
                <span className="truncate">{branch}</span>
                {branch === activeBranch && (
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                )}
              </button>
            ))}
          </div>
        )}
      </section>

      {/* Navigation */}
      <nav
        className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain pr-0.5"
        aria-label="Primary"
      >
        {userRole === 'hr' ? <>
          {visibleDestinationIds.includes('dashboard') && <section><p className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/65">Overview</p><SidebarNavButton label="Overview" icon={<LayoutDashboard className="size-4" />} active={activeTab === 'dashboard'} onClick={() => onTabChange('dashboard')} /></section>}
          {([
            { label:'Attendance', items:[['attendance','Attendance',<CalendarCheck2 className="size-4" />],['scheduling','Scheduling',<CalendarDays className="size-4" />]] },
            { label:'People', items:[['employees','Employees',<UsersRound className="size-4" />],['reports','Reports',<FileBarChart className="size-4" />]] },
            { label:'Payroll', items:[['payroll','Payroll',<WalletCards className="size-4" />],['points','Points',<BadgeCent className="size-4" />]] },
          ] as const).map((group) => <section key={group.label}><p className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/65">{group.label}</p><div className="space-y-0.5">{group.items.map(([section,label,icon]) => <SidebarNavButton key={section} label={label} icon={icon} active={activeTab === 'hr' && activeHrSection === section} onClick={() => onHrSectionChange?.(section)} />)}</div></section>)}
        </> : getNavigationGroupsForDestinations(visibleDestinationIds).map((group) => (
          <section key={group.id}>
            <p className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/65">
              {group.label}
            </p>
            <div className="space-y-0.5">
              {group.destinations.map((destination) => {
                const item = getSidebarDestinationItem(destination)

                return (
                  <SidebarNavButton
                    key={destination}
                    label={getNavigationDestinationLabel(destination, userRole, 'desktop')}
                    icon={item.icon}
                    active={activeTab === destination}
                    onClick={() => onTabChange(destination as AppTabId)}
                  />
                )
              })}
            </div>
          </section>
        ))}
      </nav>

      {/* Compact identity; account utilities live in the top-bar menu. */}
      <footer className="mt-3 shrink-0 border-t border-border/50 px-1 pt-3">
        <div className="flex items-center gap-2.5">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-foreground text-2xs font-semibold text-background">
            {initials}
          </div>
          <div className="min-w-0 leading-tight">
            <p className="truncate text-xs font-medium text-foreground">
              {userName}
            </p>
            <p className="text-2xs text-muted-foreground">
              {roleLabel}
            </p>
          </div>
        </div>
      </footer>
    </aside>
  )
}
