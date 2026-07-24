/**
 * @file PermissionMatrixPanel.tsx
 * @description Role-first permission editor. Section Access and sensitive
 * actions are grouped by business sector, with plain-language descriptions
 * and immutable-record safety notes.
 */

import { useEffect, useMemo, useState, type FC } from 'react'
import { CheckCircle2, ChevronDown, Lock, RotateCcw, Settings2, ShieldCheck, Users } from 'lucide-react'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '../ui/accordion'
import { Switch } from '../ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs'
import type { SettingsValidationErrors } from '../../domain/settings/settingsValidation'
import type { AccessLevel, AppSection } from '../../config/permissions'
import { CAPABILITY_REGISTRY, type ActionCapability, type ActionPermissionMatrix } from '../../config/actionPermissions'
import type { UserRole } from '../../store/userStore'
import type { PermissionMatrix } from '../../types/settings'
import { InfoDisclosure } from '../ui/info-disclosure'
import { SettingsSectionHeader } from './SettingsPrimitives'

interface Props {
  isEditing: boolean
  permissions: PermissionMatrix
  actionPermissions: ActionPermissionMatrix
  roleEmployeeCounts: Record<UserRole, number>
  roles: UserRole[]
  onUpdateActionAccess: (role: UserRole, capability: ActionCapability, enabled: boolean) => void
  onUpdateAccess: (role: UserRole, section: AppSection, level: AccessLevel) => void
  validationErrors: SettingsValidationErrors
}

const ROLE_LABELS: Record<UserRole, string> = {
  owner: 'Owner', admin: 'Admin', finance: 'Finance', hr: 'HR', florist: 'Florist',
}

const ROLE_DESCRIPTIONS: Record<UserRole, string> = {
  owner: 'Business owner with protected governance access.',
  finance: 'Reviews Finance work.',
  hr: 'Manages people and payroll prep.',
  admin: 'Runs daily operations.',
  florist: 'Handles floral work and assigned operational duties.',
}

type Sector = 'Store Management' | 'Sales & Finance' | 'Operations' | 'People & HR'
type WorkspaceDefinition = {
  section: AppSection
  label: string
  description: string
  safetyNote?: string
  readOnly?: boolean
}

type SectorDefinition = {
  id: Sector
  description: string
  workspaces: WorkspaceDefinition[]
}

const SECTORS: SectorDefinition[] = [
  {
    id: 'Store Management',
    description: 'Store setup and governance.',
    workspaces: [
      { section: 'dashboard', label: 'Dashboard', description: 'View allowed business summaries.', safetyNote: 'Dashboard totals are read-only.', readOnly: true },
      { section: 'catalog', label: 'Catalog', description: 'Manage products and pricing.' },
      { section: 'customers', label: 'Customers', description: 'Manage customer records.' },
      { section: 'settings', label: 'Owner Settings', description: 'Manage store-wide settings.', safetyNote: 'Owner-only governance area.' },
    ],
  },
  {
    id: 'Sales & Finance',
    description: 'Revenue and Finance workflows.',
    workspaces: [
      { section: 'revenue', label: 'Revenue', description: 'View revenue and reports.', safetyNote: 'Revenue totals are read-only.', readOnly: true },
      { section: 'finance', label: 'Finance Workspace', description: 'Access permitted Finance tools.', safetyNote: 'Final financial records stay locked.' },
    ],
  },
  {
    id: 'Operations',
    description: 'Orders, schedules, stock, and displays.',
    workspaces: [
      { section: 'orders', label: 'Orders', description: 'View and process orders.', safetyNote: 'Verified and completed orders stay protected.' },
      { section: 'scheduling', label: 'Scheduling', description: 'Manage shifts and branches.', safetyNote: 'Past schedules stay read-only.' },
      { section: 'stock', label: 'Inventory', description: 'Manage branch inventory.', safetyNote: 'Stock changes use movement records.' },
    ],
  },
  {
    id: 'People & HR',
    description: 'People, attendance, points, and payroll.',
    workspaces: [
      { section: 'hr', label: 'People & HR Workspace', description: 'Access permitted HR tools.', safetyNote: 'Approved HR records stay protected.' },
    ],
  },
]

const ACCESS_LABELS: Record<AccessLevel, string> = {
  none: 'No Access',
  view: 'View Only',
  edit: 'Manage',
}

const ACCESS_DESCRIPTIONS: Record<AccessLevel, string> = {
  none: 'Workspace is hidden.',
  view: 'View only. No changes allowed.',
  edit: 'Can use enabled actions.',
}

const capabilitySector = (capability: ActionCapability): Sector => {
  if (capability.startsWith('settings.')) return 'Store Management'
  if (capability === 'finance.view_collect_orders' || capability === 'finance.verify_order') return 'Operations'
  if (capability.startsWith('finance.')) return 'Sales & Finance'
  return 'People & HR'
}

const capabilityWorkspaceLabel = (capability: ActionCapability): string => {
  if (capability.startsWith('settings.')) return 'Owner Settings'
  if (capability === 'finance.view_collect_orders' || capability === 'finance.verify_order') return 'Order Collection'
  if (capability.includes('payroll') && capability.startsWith('finance.')) return 'Payroll Review'
  if (capability.includes('refund')) return 'Refunds'
  if (capability.includes('ledger')) return 'Finance Transactions'
  if (capability.includes('employee') && capability.startsWith('hr.')) return 'Employees'
  if (capability.includes('attendance')) return 'Attendance & Review'
  if (capability.includes('points')) return 'Points'
  if (capability.includes('payroll')) return 'Payroll Preparation'
  return 'Other'
}

const SAFETY_NOTES: Partial<Record<ActionCapability, string>> = {
  'finance.verify_order': 'Verification locks financial fields.',
  'finance.approve_employee_payroll': 'Available during Finance review only.',
  'finance.approve_all_payroll': 'Approves pending items only.',
  'finance.reject_employee_payroll': 'Reason required; returns one item to HR.',
  'finance.record_final_payment': 'Available after all items are approved.',
  'finance.approve_refund': 'Refunds preserve order history.',
  'finance.verify_ledger_entry': 'Verified entries are read-only.',
  'hr.correct_attendance': 'Original attendance evidence is preserved.',
  'hr.manage_points': 'Approved points require an adjustment.',
  'hr.edit_payroll_proposal': 'Only draft or rejected items can change.',
  'hr.resolve_rejected_employee': 'Removes one rejected item; reason required.',
  'settings.edit_branches': 'Used branch records stay protected.',
  'settings.edit_permissions': 'Owner permissions cannot be delegated.',
  'settings.edit_attendance': 'Changes apply forward only.',
  'settings.edit_scheduling': 'Future schedules only.',
  'settings.edit_payroll': 'Future payroll periods only.',
}

const isViewCapability = (capability: ActionCapability) => capability.includes('.view_') || capability === 'hr.view_employees'

const getEffectiveLevel = (workspace: WorkspaceDefinition, level: AccessLevel): AccessLevel => workspace.readOnly && level === 'edit' ? 'view' : level

const AccessBadge: FC<{ level: AccessLevel }> = ({ level }) => (
  <span className={`inline-flex rounded-full px-2 py-0.5 text-2xs font-semibold ${
    level === 'edit' ? 'bg-surface-success text-success' : level === 'view' ? 'bg-warning/10 text-warning' : 'bg-muted text-muted-foreground'
  }`}>{ACCESS_LABELS[level]}</span>
)

export const PermissionMatrixPanel: FC<Props> = ({
  permissions,
  actionPermissions,
  roleEmployeeCounts,
  roles,
  onUpdateActionAccess,
  onUpdateAccess,
  isEditing,
  validationErrors,
}) => {
  const [selectedRole, setSelectedRole] = useState<UserRole>(roles[0] ?? 'owner')
  const [activeSector, setActiveSector] = useState<Sector | 'summary'>('Store Management')
  const [showAdvanced, setShowAdvanced] = useState(false)

  useEffect(() => {
    setShowAdvanced(false)
    setActiveSector('Store Management')
  }, [isEditing, selectedRole])

  const role = roles.includes(selectedRole) ? selectedRole : roles[0] ?? 'owner'
  const employeeCount = roleEmployeeCounts[role] ?? 0

  const roleActions = useMemo(() => CAPABILITY_REGISTRY.filter((item) => {
    const parent = permissions[role]?.[item.parentSection] ?? 'none'
    return parent !== 'none'
  }), [permissions, role])

  const allowedActions = roleActions.filter((item) => Boolean(actionPermissions[role]?.[item.id]))
  const deniedActions = roleActions.filter((item) => !actionPermissions[role]?.[item.id])

  const renderActionRows = (items: typeof CAPABILITY_REGISTRY) => (
    <div className="divide-y divide-border/60">
      {items.map((item) => {
        const parentLevel = permissions[role]?.[item.parentSection] ?? 'none'
        const needsManage = !isViewCapability(item.id)
        const parentAllows = parentLevel !== 'none' && (!needsManage || parentLevel === 'edit')
        const safetyLocked = item.id.startsWith('settings.')
        const enabled = Boolean(actionPermissions[role]?.[item.id]) && parentAllows
        const unavailableReason = parentLevel === 'none'
          ? 'Set the parent workspace to View Only or Manage first.'
          : needsManage && parentLevel !== 'edit'
            ? 'Requires Manage access to the parent workspace.'
            : safetyLocked && role !== 'owner'
              ? 'Protected Owner-only setting.'
              : null

        return (
          <div key={item.id} className={`flex gap-4 px-4 py-3 ${parentAllows ? 'bg-background' : 'bg-surface-panel'}`}>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-foreground">{item.label}</p>
              <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{item.description}</p>
              {SAFETY_NOTES[item.id] && (
                <p className="mt-1.5 flex gap-1.5 text-xs leading-relaxed text-muted-foreground">
                  <Lock className="mt-0.5 size-3 shrink-0" />
                  {SAFETY_NOTES[item.id]}
                </p>
              )}
              {unavailableReason && <p className="mt-1.5 text-2xs font-medium text-warning">{unavailableReason}</p>}
            </div>
            <div className="flex shrink-0 items-center gap-2 self-start pt-0.5">
              {isEditing && <span className="hidden text-2xs font-medium text-muted-foreground sm:inline">{enabled ? 'Allowed' : 'Off'}</span>}
              {isEditing ? (
                <Switch
                  checked={enabled}
                  disabled={!parentAllows || safetyLocked}
                  onCheckedChange={(checked) => onUpdateActionAccess(role, item.id, checked)}
                  aria-label={`${item.label}: ${enabled ? 'allowed' : 'not allowed'}`}
                />
              ) : (
                <span className={`rounded-full px-2.5 py-1 text-2xs font-semibold ${enabled ? 'bg-surface-success text-success' : 'bg-muted text-muted-foreground ring-1 ring-border/60'}`}>
                  {enabled ? 'Allowed' : 'Off'}
                </span>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )

  const renderSector = (sector: SectorDefinition) => {
    const sectorActions = CAPABILITY_REGISTRY.filter((item) => capabilitySector(item.id) === sector.id)
    const actionGroups = Array.from(new Set(sectorActions.map((item) => capabilityWorkspaceLabel(item.id))))

    return (
      <div className="space-y-4 pb-8">
        <div className="rounded-xl border border-border/70 bg-surface-panel px-4 py-3">
          <h3 className="text-sm font-semibold leading-5">{sector.id}</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">{sector.description}</p>
        </div>

        <Accordion type="multiple" className="space-y-2">
          {sector.workspaces.map((workspace) => {
            const rawLevel = permissions[role]?.[workspace.section] ?? 'none'
            const displayedLevel = getEffectiveLevel(workspace, rawLevel)
            const locked = workspace.section === 'settings'
            const levels: AccessLevel[] = workspace.readOnly ? ['none', 'view'] : ['none', 'view', 'edit']
            const workspaceActions = sectorActions.filter((item) => item.parentSection === workspace.section)

            return (
              <AccordionItem key={workspace.section} value={`workspace-${workspace.section}`} className="overflow-hidden rounded-xl border border-border/70 bg-surface-card px-0">
                <AccordionTrigger className="px-4 py-3 hover:no-underline">
                  <div className="flex min-w-0 flex-1 items-center justify-between gap-3 pr-2 text-left">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold leading-5">{workspace.label}</span>
                        {workspace.readOnly && <span className="rounded-full bg-surface-neutral px-2 py-0.5 text-xs text-foreground ring-1 ring-border/80">Read-only</span>}
                        {locked && <Lock className="size-3.5 text-muted-foreground" />}
                      </div>
                      <p className="mt-0.5 line-clamp-2 text-xs font-normal leading-relaxed text-muted-foreground">{workspace.description}</p>
                    </div>
                    <AccessBadge level={displayedLevel} />
                  </div>
                </AccordionTrigger>
                <AccordionContent className="border-t border-border/60 px-0 pb-0">
                  <div className="space-y-4 p-4">
                    <div>
                      <div className="mb-2 flex items-center justify-between gap-3">
                        <div>
                          <p className="text-xs font-semibold">Section Access</p>
                          <p className="mt-0.5 text-xs text-muted-foreground">Choose whether this role can open, view, or manage this section.</p>
                        </div>
                      </div>
                      {isEditing ? (
                        <div className={`grid gap-1 rounded-xl bg-surface-track p-1 ${levels.length === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}>
                          {levels.map((level) => (
                            <button
                              key={level}
                              type="button"
                              disabled={locked || (role === 'owner' && level === 'none')}
                              onClick={() => onUpdateAccess(role, workspace.section, level)}
                              className={`rounded-lg px-2 py-2.5 text-xs font-semibold transition ${displayedLevel === level ? 'bg-surface-selected text-primary-foreground shadow-sm ring-1 ring-primary/30' : 'text-muted-foreground hover:text-foreground'} ${locked || (role === 'owner' && level === 'none') ? 'cursor-not-allowed opacity-65' : ''}`}
                            >
                              {ACCESS_LABELS[level]}
                            </button>
                          ))}
                        </div>
                      ) : (
                        <AccessBadge level={displayedLevel} />
                      )}
                      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{ACCESS_DESCRIPTIONS[displayedLevel]}</p>
                      {role === 'owner' && <p className="mt-1 text-2xs font-medium text-warning">Owner access cannot be set to None, preventing the only recovery role from being locked out.</p>}
                    </div>

                    {workspace.safetyNote && (
                      <InfoDisclosure title="Why some records stay protected">
                        <p>{workspace.safetyNote}</p>
                      </InfoDisclosure>
                    )}
                  </div>

                  {workspaceActions.length > 0 && (
                    <div className="border-t border-border/60">
                      <div className="flex items-center justify-between gap-3 bg-surface-panel px-4 py-2.5">
                        <div>
                          <p className="text-xs font-semibold">Detailed Feature Access</p>
                          <p className="text-xs text-muted-foreground">Toggle only the actions this role needs.</p>
                        </div>
                        <span className="text-2xs font-semibold text-muted-foreground">Detailed Feature Access · {workspaceActions.filter((item) => actionPermissions[role]?.[item.id]).length}/{workspaceActions.length} on</span>
                      </div>
                      {renderActionRows(workspaceActions)}
                    </div>
                  )}
                </AccordionContent>
              </AccordionItem>
            )
          })}
        </Accordion>

        {actionGroups.filter((group) => !sector.workspaces.some((workspace) => sectorActions.some((item) => item.parentSection === workspace.section && capabilityWorkspaceLabel(item.id) === group))).map((group) => {
          const groupItems = sectorActions.filter((item) => capabilityWorkspaceLabel(item.id) === group)
          return (
            <Accordion key={group} type="single" collapsible>
              <AccordionItem value={`actions-${group}`} className="overflow-hidden rounded-xl border border-border/70 bg-surface-card px-0">
                <AccordionTrigger className="px-4 py-3 hover:no-underline">
                  <div className="flex min-w-0 flex-1 items-center justify-between gap-3 pr-2 text-left">
                    <div><p className="text-sm font-semibold leading-5">{group}</p><p className="mt-0.5 text-xs font-normal text-muted-foreground">Detailed action permissions</p></div>
                    <span className="rounded-full bg-surface-neutral px-2 py-0.5 text-xs text-foreground ring-1 ring-border/80">{groupItems.filter((item) => actionPermissions[role]?.[item.id]).length}/{groupItems.length} on</span>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="border-t border-border/60 p-0">{renderActionRows(groupItems)}</AccordionContent>
              </AccordionItem>
            </Accordion>
          )
        })}
      </div>
    )
  }

  return (
    <section className="min-w-0">
      <section className="min-w-0 space-y-5">
        <SettingsSectionHeader icon={ShieldCheck} title="Access control" description="Configure Section Access first, then adjust Detailed Feature Access only when needed." />

        {(validationErrors.ownerSettings || validationErrors.nonOwnerSettings) && <div className="space-y-1 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
          {validationErrors.ownerSettings && <p className="text-xs font-medium text-destructive">{validationErrors.ownerSettings}</p>}
          {validationErrors.nonOwnerSettings && <p className="text-xs font-medium text-destructive">{validationErrors.nonOwnerSettings}</p>}
        </div>}

        <section className="rounded-2xl border border-border bg-card p-4 shadow-ios-sm sm:p-5">
          <div className="grid gap-4 md:grid-cols-[minmax(220px,320px)_1fr] md:items-center">
            <label className="space-y-1.5">
              <span className="text-xs font-semibold">Configure role</span>
              <div className="relative">
                <select value={role} onChange={(event) => setSelectedRole(event.target.value as UserRole)} className="h-10 w-full appearance-none rounded-full border border-border bg-background px-3 pr-9 text-sm font-medium outline-none focus:ring-2 focus:ring-primary/20">
                  {roles.map((item) => <option key={item} value={item}>{ROLE_LABELS[item]}</option>)}
                </select>
                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              </div>
            </label>
            <div className="flex flex-wrap items-center gap-3">
              <div><p className="text-sm font-semibold leading-5">{ROLE_LABELS[role]}</p><p className="text-xs text-muted-foreground">{ROLE_DESCRIPTIONS[role]}</p></div>
              <span className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2.5 py-1 text-xs text-muted-foreground"><Users className="size-3" />{employeeCount} active employee{employeeCount === 1 ? '' : 's'}</span>
              {role === 'owner' && <span className="inline-flex items-center gap-1 rounded-full bg-foreground px-2.5 py-1 text-2xs font-medium text-background"><Lock className="size-3" />Protected role</span>}
            </div>
          </div>
        </section>

        <section className="space-y-4 rounded-2xl border border-border/70 bg-card p-4 shadow-sm sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h3 className="text-sm font-semibold leading-5">{ROLE_LABELS[role]} Access</h3>
              <p className="mt-1 text-xs text-muted-foreground">{isEditing ? 'Edit Section Access and Detailed Feature Access for this role.' : 'Review the current Section Access and Detailed Feature Access for this role.'}</p>
            </div>
            <button
              type="button"
              onClick={() => setShowAdvanced((current) => !current)}
              className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-full border border-border bg-background px-[18px] text-sm font-semibold text-foreground transition hover:bg-muted"
            >
              <Settings2 className="size-3.5" />
              {showAdvanced ? 'Hide access details' : isEditing ? 'Customize access' : 'View access details'}
            </button>
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            <div className="rounded-xl border border-success/30 bg-surface-success p-4">
              <div className="flex items-center justify-between gap-3">
                <h4 className="flex items-center gap-2 text-xs font-semibold"><CheckCircle2 className="size-4 text-success" />Available workspaces</h4>
                <span className="rounded-full bg-background px-2 py-0.5 text-xs text-muted-foreground">{SECTORS.flatMap((sector) => sector.workspaces).filter((workspace) => (permissions[role]?.[workspace.section] ?? 'none') !== 'none').length} enabled</span>
              </div>
              <div className="mt-3 space-y-2">
                {SECTORS.flatMap((sector) => sector.workspaces).filter((workspace) => (permissions[role]?.[workspace.section] ?? 'none') !== 'none').map((workspace) => {
                  const level = getEffectiveLevel(workspace, permissions[role]?.[workspace.section] ?? 'none')
                  return <div key={workspace.section} className="flex items-center justify-between gap-3 rounded-lg bg-background/80 px-3 py-2"><span className="text-xs font-medium">{workspace.label}</span><AccessBadge level={level} /></div>
                })}
                {SECTORS.flatMap((sector) => sector.workspaces).every((workspace) => (permissions[role]?.[workspace.section] ?? 'none') === 'none') && <p className="text-xs text-muted-foreground">No workspace access is currently enabled.</p>}
              </div>
            </div>

            <div className="rounded-2xl border border-border bg-card p-4 shadow-ios-sm sm:p-5">
              <div className="flex items-center justify-between gap-3">
                <h4 className="text-xs font-semibold">Detailed Feature Access</h4>
                <span className="rounded-full bg-background px-2 py-0.5 text-xs text-muted-foreground">{allowedActions.length} total</span>
              </div>
              <ul className="mt-3 space-y-2">
                {allowedActions.slice(0, 8).map((item) => <li key={item.id} className="flex items-start gap-2 text-xs text-muted-foreground"><CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-success" /><span>{item.label}</span></li>)}
                {allowedActions.length === 0 && <li className="text-xs text-muted-foreground">No Detailed Feature Access is currently enabled.</li>}
              </ul>
              {allowedActions.length > 8 && <p className="mt-3 text-xs text-muted-foreground">+{allowedActions.length - 8} more enabled features. Open access controls to review all of them.</p>}
              <div className="mt-4 rounded-lg border border-border/70 bg-background p-3">
                <p className="flex items-center gap-2 text-xs font-semibold"><Lock className="size-3.5" />Protected records stay protected</p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">Verified, approved, paid, and historical records still use their supported correction workflows, even when this role has Manage access.</p>
              </div>
            </div>
          </div>
        </section>

        {showAdvanced && (
        <Tabs value={activeSector} onValueChange={(value) => setActiveSector(value as Sector | 'summary')}>
          <TabsList className="h-auto w-full justify-start gap-1 overflow-x-auto rounded-xl border border-border/70 bg-surface-panel p-1">
            {SECTORS.map((sector) => <TabsTrigger key={sector.id} value={sector.id} className="whitespace-nowrap text-xs">{sector.id}</TabsTrigger>)}
            <TabsTrigger value="summary" className="whitespace-nowrap text-xs">Summary</TabsTrigger>
          </TabsList>

          {SECTORS.map((sector) => <TabsContent key={sector.id} value={sector.id} className="mt-4">{renderSector(sector)}</TabsContent>)}

          <TabsContent value="summary" className="mt-4 space-y-4">
            <section className="rounded-xl border border-border/70 p-4">
              <div className="flex items-center justify-between gap-3"><div><h3 className="text-sm font-semibold leading-5">{ROLE_LABELS[role]} effective access</h3><p className="mt-0.5 text-xs text-muted-foreground">Final result of Section Access and Detailed Feature Access.</p></div><span className="rounded-full bg-surface-neutral px-2.5 py-1 text-xs text-foreground ring-1 ring-border/80">{allowedActions.length} actions allowed</span></div>
            </section>
            <div className="grid gap-4 lg:grid-cols-2">
              <section className="rounded-xl border border-success/30 bg-surface-success p-4">
                <h4 className="flex items-center gap-2 text-sm font-semibold"><CheckCircle2 className="size-4 text-success" />Can access and perform</h4>
                <div className="mt-3 space-y-3">
                  {SECTORS.map((sector) => {
                    const workspaces = sector.workspaces.filter((workspace) => (permissions[role]?.[workspace.section] ?? 'none') !== 'none')
                    if (!workspaces.length) return null
                    return <div key={sector.id}><p className="text-xs font-semibold">{sector.id}</p><ul className="mt-1 space-y-1 text-xs text-muted-foreground">{workspaces.map((workspace) => <li key={workspace.section}>• {ACCESS_LABELS[getEffectiveLevel(workspace, permissions[role]?.[workspace.section] ?? 'none')]} — {workspace.label}</li>)}</ul></div>
                  })}
                  {allowedActions.length > 0 && <div><p className="text-xs font-semibold">Detailed Feature Access</p><ul className="mt-1 space-y-1 text-xs text-muted-foreground">{allowedActions.map((item) => <li key={item.id}>• {item.label}</li>)}</ul></div>}
                </div>
              </section>
              <section className="rounded-2xl border border-border bg-card p-4 shadow-ios-sm sm:p-5">
                <h4 className="flex items-center gap-2 text-sm font-semibold"><Lock className="size-4" />Cannot access or modify</h4>
                <div className="mt-3 space-y-3 text-xs text-muted-foreground">
                  <ul className="space-y-1">
                    {SECTORS.flatMap((sector) => sector.workspaces).filter((workspace) => (permissions[role]?.[workspace.section] ?? 'none') === 'none').map((workspace) => <li key={workspace.section}>• No access — {workspace.label}</li>)}
                    {deniedActions.slice(0, 12).map((item) => <li key={item.id}>• Not allowed — {item.label}</li>)}
                  </ul>
                  <div className="rounded-lg border border-border/70 bg-background p-3"><p className="font-semibold text-foreground">Always protected</p><p className="mt-1 leading-relaxed">Finalized, verified, approved, paid, and historical records cannot be overwritten. Corrections use supported reversal, amendment, resolution, or new-revision workflows.</p></div>
                </div>
              </section>
            </div>
            <div className="flex items-start gap-2 rounded-lg border border-border/70 bg-surface-panel p-3 text-xs text-muted-foreground"><RotateCcw className="mt-0.5 size-3.5 shrink-0" /><span>Section Access controls modules. Detailed Feature Access controls actions inside enabled modules.</span></div>
          </TabsContent>
        </Tabs>
        )}
      </section>
    </section>
  )
}
