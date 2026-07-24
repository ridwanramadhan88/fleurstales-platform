/**
 * @file ModuleShortcuts.tsx
 * @description Role-aware grouped mobile workspace for allowed destinations
 * that are intentionally not placed in the four-item bottom navigation.
 */

import type { FC } from 'react'
import {
  BarChart3,
  BookOpen,
  Boxes,
  CreditCard,
  Home,
  ReceiptText,
  Settings,
  Users,
  UserRoundCog,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { UserRole } from '../../store/userStore'
import {
  getAccessibleNavigationDestinationIds,
  getNavigationDestinationLabel,
  getNavigationGroupsForDestinations,
  type NavigationDestinationId,
} from '../../config/navigationGroups'
import { getSecondaryMobileDestinationIds } from '../../config/mobileNavigation'
import { toAppTab, type AppNavigationRequest } from '../../config/appNavigation'
import { useSettingsStore } from '../../store/settingsStore'

const DESTINATION_ICON: Record<NavigationDestinationId, LucideIcon> = {
  dashboard: Home,
  orders: ReceiptText,
  finance: CreditCard,
  hr: UserRoundCog,
  catalog: BookOpen,
  stock: Boxes,
  customers: Users,
  revenue: BarChart3,
  settings: Settings,
}

const ShortcutButton: FC<{
  icon: LucideIcon
  label: string
  onClick: () => void
}> = ({ icon: Icon, label, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className="tap-scale flex aspect-square min-w-0 flex-col items-center justify-center gap-2 rounded-2xl bg-card p-3 text-center ring-1 ring-border/60 transition hover:bg-accent/60 lg:hidden min-h-14 py-3"
  >
    <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted text-foreground">
      <Icon className="size-[18px]" />
    </span>
    <span className="line-clamp-2 text-xs font-semibold leading-tight text-foreground">
      {label}
    </span>
  </button>
)

export interface ModuleShortcutsProps {
  userRole: UserRole
  onNavigate: (target: AppNavigationRequest) => void
}

export const ModuleShortcuts: FC<ModuleShortcutsProps> = ({
  userRole,
  onNavigate,
}) => {
  const permissions = useSettingsStore((state) => state.permissions)
  const inventoryEnabled = useSettingsStore((state) => state.storeProfile.inventoryEnabled)

  const accessibleIds = getAccessibleNavigationDestinationIds({
    role: userRole,
    permissions,
    inventoryEnabled,
  })
  const secondaryIds = getSecondaryMobileDestinationIds(userRole, accessibleIds)
  const groups = getNavigationGroupsForDestinations(secondaryIds)
  if (groups.length === 0) return null

  return (
    <section aria-label="Workspace" className="space-y-4 lg:hidden">
      <div>
        <h2 className="text-base font-semibold leading-6 text-foreground">Workspace</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          All other tools available for your role.
        </p>
      </div>

      <div className="space-y-5">
        {groups.map((group) => (
          <section key={group.id} aria-labelledby={`workspace-${group.id}`} className="space-y-2.5">
            <h3
              id={`workspace-${group.id}`}
              className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground"
            >
              {group.label}
            </h3>
            <div className="grid grid-cols-3 gap-2.5">
              {group.destinations.map((id) => (
                <ShortcutButton
                  key={id}
                  icon={DESTINATION_ICON[id]}
                  label={getNavigationDestinationLabel(id, userRole, 'workspace')}
                  onClick={() => onNavigate(toAppTab(id))}
                />
              ))}
            </div>
          </section>
        ))}
      </div>
    </section>
  )
}
