/**
 * @file BranchSettingsPanel.tsx
 * @description Owner-editable branch list and weekly opening hours.
 */

import { useEffect, useMemo, useState, type FC } from 'react'
import { Building2, CalendarDays, Clock3, Plus, MapPin, LocateFixed, ExternalLink, AlertTriangle, LockKeyhole, ChevronDown, Pencil } from 'lucide-react'
import type { BranchOpeningHours, BranchSettings, DayOpeningHours, WeekdayKey } from '../../types/settings'
import type { SettingsValidationErrors } from '../../domain/settings/settingsValidation'
import { DEFAULT_BRANCH_OPENING_HOURS, WEEKDAY_KEYS, WEEKDAY_LABELS } from '../../domain/branchOpeningHoursDomain'
import { TimeSelectField } from '../ui/date-time-field'
import type { BranchDependencyImpact } from '../../domain/settings/branchSafetyDomain'
import { SettingsSectionHeader } from './SettingsPrimitives'

interface Props {
  isEditing: boolean
  branches: BranchSettings[]
  onAddBranch: () => void
  onUpdateBranch: (branchId: string, patch: Partial<BranchSettings>) => void
  onSetBranchActive: (branchId: string, isActive: boolean) => void
  branchImpacts?: Record<string, BranchDependencyImpact>
  validationErrors?: SettingsValidationErrors
}


const BranchLocationEditor: FC<{ branch: BranchSettings; onUpdateBranch: Props['onUpdateBranch']; isEditing: boolean }> = ({ branch, onUpdateBranch, isEditing }) => {
  const location = branch.location ?? { latitude: -5.3971, longitude: 105.2668 }
  const [locating, setLocating] = useState(false)
  const useCurrentLocation = () => {
    if (!navigator.geolocation) return
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (position) => {
        onUpdateBranch(branch.id, { location: { latitude: position.coords.latitude, longitude: position.coords.longitude } })
        setLocating(false)
      },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 15000 },
    )
  }
  const mapUrl = `https://www.openstreetmap.org/?mlat=${location.latitude}&mlon=${location.longitude}#map=18/${location.latitude}/${location.longitude}`
  return (
    <div className="space-y-3 rounded-lg border border-border/70 bg-card p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2"><MapPin className="size-4 text-primary"/><div><p className="text-xs font-semibold">Branch map location</p><p className="text-xs text-muted-foreground">Used to validate selfie attendance distance.</p></div></div>
        {isEditing && (
          <button type="button" onClick={useCurrentLocation} className="inline-flex items-center rounded-full border border-border text-xs font-medium hover:bg-muted rounded-full px-[18px] whitespace-nowrap h-11 rounded-full px-[18px] gap-2 whitespace-nowrap"><LocateFixed className="size-3.5"/>{locating ? 'Locating…' : 'Use current location'}</button>
        )}
      </div>
      {isEditing ? (
        <div className="grid grid-cols-2 gap-2">
          <label className="space-y-1"><span className="text-2xs font-semibold text-muted-foreground">Latitude</span><input aria-label={`${branch.name || 'Branch'} latitude`} type="number" step="0.000001" value={location.latitude} onChange={(e)=>onUpdateBranch(branch.id,{location:{...location,latitude:Number(e.target.value)}})} className={FIELD_CLASS}/></label>
          <label className="space-y-1"><span className="text-2xs font-semibold text-muted-foreground">Longitude</span><input aria-label={`${branch.name || 'Branch'} longitude`} type="number" step="0.000001" value={location.longitude} onChange={(e)=>onUpdateBranch(branch.id,{location:{...location,longitude:Number(e.target.value)}})} className={FIELD_CLASS}/></label>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div><p className="text-2xs font-semibold text-muted-foreground">Latitude</p><p className="mt-0.5 font-medium text-foreground">{location.latitude.toFixed(6)}</p></div>
          <div><p className="text-2xs font-semibold text-muted-foreground">Longitude</p><p className="mt-0.5 font-medium text-foreground">{location.longitude.toFixed(6)}</p></div>
        </div>
      )}
      <div className="overflow-hidden rounded-lg border border-border/70 bg-muted"><iframe title={`${branch.name || 'Branch'} map preview`} loading="lazy" className="h-44 w-full" src={`https://www.openstreetmap.org/export/embed.html?bbox=${location.longitude-0.003}%2C${location.latitude-0.003}%2C${location.longitude+0.003}%2C${location.latitude+0.003}&layer=mapnik&marker=${location.latitude}%2C${location.longitude}`} /></div>
      <a href={mapUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"><ExternalLink className="size-3.5"/>Open map and confirm pin</a>
    </div>
  )
}

const FIELD_CLASS =
  'h-8 w-full rounded-sm border border-transparent bg-background px-2 text-xs text-foreground outline-none ring-1 ring-border/70 focus:border-primary/40 focus:ring-2 focus:ring-primary/30 dark:focus:ring-primary/40'

const cloneOpeningHours = (hours: BranchOpeningHours): BranchOpeningHours =>
  Object.fromEntries(
    WEEKDAY_KEYS.map((day) => [day, { ...hours[day] }]),
  ) as unknown as BranchOpeningHours

const areDayHoursEqual = (left: DayOpeningHours, right: DayOpeningHours): boolean =>
  left.isOpen === right.isOpen &&
  left.opensAt === right.opensAt &&
  left.closesAt === right.closesAt

const usesIndividualDayHours = (hours: BranchOpeningHours): boolean => {
  const baseline = hours.monday
  return WEEKDAY_KEYS.some((day) => !areDayHoursEqual(hours[day], baseline))
}

const applyHoursToAllDays = (hours: DayOpeningHours): BranchOpeningHours =>
  Object.fromEntries(
    WEEKDAY_KEYS.map((day) => [day, { ...hours }]),
  ) as unknown as BranchOpeningHours

const summarizeOpeningHours = (branch: BranchSettings): string => {
  const hours = branch.openingHours ?? DEFAULT_BRANCH_OPENING_HOURS
  const openDays = WEEKDAY_KEYS.filter((day) => hours[day].isOpen)
  if (openDays.length === 0) return 'Closed all week'
  const first = hours[openDays[0]]
  const sameHours = openDays.every((day) =>
    hours[day].opensAt === first.opensAt && hours[day].closesAt === first.closesAt,
  )
  if (openDays.length === 7 && sameHours) return `Daily · ${first.opensAt}–${first.closesAt}`
  if (sameHours) return `${openDays.length} open days · ${first.opensAt}–${first.closesAt}`
  return `${openDays.length} open days · Custom hours`
}

const OpeningHoursSummary: FC<{ branch: BranchSettings }> = ({ branch }) => {
  const hours = branch.openingHours ?? DEFAULT_BRANCH_OPENING_HOURS
  return (
    <div className="space-y-3 rounded-lg bg-background/80 p-3 ring-1 ring-border/60">
      <div className="flex items-center gap-2">
        <span className="flex size-8 items-center justify-center rounded-lg bg-muted text-foreground">
          <Clock3 className="size-4" />
        </span>
        <div>
          <p className="text-xs font-semibold text-foreground">Opening hours</p>
          <p className="text-xs text-muted-foreground">Controls available delivery, pickup, and employee check-out times.</p>
        </div>
      </div>
      <div className="divide-y divide-border/50 overflow-hidden rounded-lg bg-surface-panel">
        {WEEKDAY_KEYS.map((day) => {
          const dayHours = hours[day]
          return (
            <div key={day} className="flex items-center justify-between px-3 py-2 text-xs">
              <span className="font-medium text-foreground">{WEEKDAY_LABELS[day]}</span>
              <span className="text-muted-foreground">{dayHours.isOpen ? `${dayHours.opensAt} – ${dayHours.closesAt}` : 'Closed'}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

const OpeningHoursEditor: FC<{
  branch: BranchSettings
  onUpdateBranch: Props['onUpdateBranch']
}> = ({ branch, onUpdateBranch }) => {
  const openingHours = useMemo(
    () => cloneOpeningHours(branch.openingHours ?? DEFAULT_BRANCH_OPENING_HOURS),
    [branch.openingHours],
  )
  const [mode, setMode] = useState<'all' | 'individual'>(() =>
    usesIndividualDayHours(openingHours) ? 'individual' : 'all',
  )

  const updateAllDays = (patch: Partial<DayOpeningHours>) => {
    const next = { ...openingHours.monday, ...patch }
    onUpdateBranch(branch.id, { openingHours: applyHoursToAllDays(next) })
  }

  const updateDay = (day: WeekdayKey, patch: Partial<DayOpeningHours>) => {
    onUpdateBranch(branch.id, {
      openingHours: {
        ...openingHours,
        [day]: { ...openingHours[day], ...patch },
      },
    })
  }

  const switchMode = (nextMode: 'all' | 'individual') => {
    if (nextMode === mode) return
    if (nextMode === 'all') {
      // Returning to the shared schedule intentionally applies Monday's
      // current hours to every day, making the resulting rule explicit.
      onUpdateBranch(branch.id, {
        openingHours: applyHoursToAllDays(openingHours.monday),
      })
    }
    setMode(nextMode)
  }

  const sharedHours = openingHours.monday

  return (
    <div className="space-y-3 rounded-lg bg-background/80 p-3 ring-1 ring-border/60">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <span className="flex size-8 items-center justify-center rounded-lg bg-muted text-foreground">
            <Clock3 className="size-4" />
          </span>
          <div>
            <p className="text-xs font-semibold text-foreground">Opening hours</p>
            <p className="text-xs text-muted-foreground">
              Controls available delivery, pickup, and employee check-out times.
            </p>
          </div>
        </div>

        <div className="inline-flex w-full rounded-lg bg-muted p-1 sm:w-auto" aria-label="Opening-hours mode">
          <button
            type="button"
            onClick={() => switchMode('all')}
            aria-pressed={mode === 'all'}
            className={`flex-1 rounded-md px-3 py-1.5 text-2xs font-semibold transition sm:flex-none ${
              mode === 'all'
                ? 'bg-card text-foreground shadow-sm ring-1 ring-border/60'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Same every day
          </button>
          <button
            type="button"
            onClick={() => switchMode('individual')}
            aria-pressed={mode === 'individual'}
            className={`flex-1 rounded-md px-3 py-1.5 text-2xs font-semibold transition sm:flex-none ${
              mode === 'individual'
                ? 'bg-card text-foreground shadow-sm ring-1 ring-border/60'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Customize days
          </button>
        </div>
      </div>

      {mode === 'all' ? (
        <div className="rounded-lg bg-surface-panel p-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex min-w-[9rem] items-center justify-between gap-3 sm:pb-2">
              <div>
                <p className="text-xs font-medium text-foreground">Open all days</p>
                <p className="text-xs text-muted-foreground">Monday–Sunday</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-label="Open all days"
                aria-checked={sharedHours.isOpen}
                onClick={() => updateAllDays({ isOpen: !sharedHours.isOpen })}
                className={`relative h-6 w-11 rounded-full transition ${sharedHours.isOpen ? 'bg-primary' : 'bg-border'}`}
              >
                <span className={`absolute left-0 top-0.5 size-5 rounded-full bg-white shadow transition-transform ${sharedHours.isOpen ? 'translate-x-5' : 'translate-x-0.5'}`} />
              </button>
            </div>

            {sharedHours.isOpen ? (
              <div className="grid flex-1 grid-cols-2 gap-2">
                <label className="space-y-1">
                  <span className="text-2xs font-semibold text-muted-foreground">Opens</span>
                  <TimeSelectField
                    value={sharedHours.opensAt}
                    onChange={(value) => updateAllDays({ opensAt: value })}
                    className="h-10 bg-card text-sm"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-2xs font-semibold text-muted-foreground">Closes</span>
                  <TimeSelectField
                    value={sharedHours.closesAt}
                    onChange={(value) => updateAllDays({ closesAt: value })}
                    className="h-10 bg-card text-sm"
                  />
                </label>
              </div>
            ) : (
              <div className="flex flex-1 items-center rounded-lg bg-card px-3 py-2.5 text-xs text-muted-foreground ring-1 ring-border/60">
                Branch is closed every day. Use “Customize days” to open selected days.
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {WEEKDAY_KEYS.map((day) => {
            const hours = openingHours[day]
            return (
              <div
                key={day}
                className="grid gap-2 rounded-lg bg-surface-panel p-2.5 sm:grid-cols-[7rem_5.5rem_1fr] sm:items-center"
              >
                <div className="flex items-center gap-2">
                  <CalendarDays className="size-3.5 text-muted-foreground" />
                  <span className="text-xs font-semibold text-foreground">
                    {WEEKDAY_LABELS[day]}
                  </span>
                </div>

                <button
                  type="button"
                  role="switch"
                  aria-label={`${WEEKDAY_LABELS[day]} open`}
                  aria-checked={hours.isOpen}
                  onClick={() => updateDay(day, { isOpen: !hours.isOpen })}
                  className="flex items-center gap-2 text-left"
                >
                  <span className={`relative h-5 w-9 rounded-full transition ${hours.isOpen ? 'bg-primary' : 'bg-border'}`}>
                    <span className={`absolute left-0 top-0.5 size-4 rounded-full bg-white shadow transition-transform ${hours.isOpen ? 'translate-x-[18px]' : 'translate-x-0.5'}`} />
                  </span>
                  <span className="text-2xs font-medium text-muted-foreground">
                    {hours.isOpen ? 'Open' : 'Closed'}
                  </span>
                </button>

                {hours.isOpen ? (
                  <div className="grid grid-cols-2 gap-2">
                    <TimeSelectField
                      value={hours.opensAt}
                      onChange={(value) => updateDay(day, { opensAt: value })}
                      className="h-9 bg-card text-xs"
                    />
                    <TimeSelectField
                      value={hours.closesAt}
                      onChange={(value) => updateDay(day, { closesAt: value })}
                      className="h-9 bg-card text-xs"
                    />
                  </div>
                ) : (
                  <div className="rounded-md bg-card px-3 py-2 text-xs text-muted-foreground ring-1 ring-border/50">
                    No delivery, pickup, or check-out window.
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export const BranchSettingsPanel: FC<Props> = ({
  branches,
  onAddBranch,
  onUpdateBranch,
  onSetBranchActive,
  branchImpacts = {},
  isEditing,
  validationErrors = {},
}) => {
  const [expandedBranchId, setExpandedBranchId] = useState<string | null>(null)

  useEffect(() => {
    setExpandedBranchId(null)
  }, [isEditing])

  return (
      <section className="space-y-5">
        <SettingsSectionHeader
          icon={Building2}
          title="Branch operations"
          description="Manage branch details, availability, and operating schedules."
          action={isEditing ? <button type="button" onClick={onAddBranch} className="inline-flex items-center bg-primary text-sm font-semibold text-primary-foreground shadow-sm rounded-full px-[18px] whitespace-nowrap h-11 rounded-full px-[18px] gap-2 whitespace-nowrap"><Plus className="size-4" /> Add branch</button> : undefined}
        />

        {validationErrors.branches && <p className="text-2xs font-medium text-destructive">{validationErrors.branches}</p>}
        <div className="space-y-3">
          {branches.map((branch, branchIndex) => {
            const impact = branchImpacts[branch.id]
            const isExpanded = expandedBranchId === branch.id
            const branchErrors = Object.keys(validationErrors).some((key) => key.startsWith(`branch.${branchIndex}.`))

            return (
              <article
                key={branch.id}
                className={`overflow-hidden rounded-2xl border bg-card shadow-sm transition ${
                  branchErrors ? 'ring-destructive/40' : 'ring-border/70'
                } ${branch.isActive ? '' : 'opacity-70'}`}
              >
                <div className="space-y-3 p-3 sm:p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="truncate text-sm font-semibold text-foreground">{branch.name || 'Unnamed branch'}</h3>
                        <span className="rounded-full bg-surface-neutral px-2 py-0.5 font-mono text-xs text-foreground ring-1 ring-border/80">{branch.code || 'NO CODE'}</span>
                        {branchErrors && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-2xs font-semibold text-destructive">
                            <AlertTriangle className="size-3" /> Needs attention
                          </span>
                        )}
                      </div>
                      <p className={branch.address ? 'truncate text-xs text-muted-foreground' : 'truncate text-xs text-muted-foreground/40'}>{branch.address || 'Address not added'}</p>
                    </div>

                    <div className="flex shrink-0 items-center justify-between gap-3 sm:justify-end">
                      <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${branch.isActive ? 'text-success' : 'text-muted-foreground'}`}>
                        <span className={`h-2 w-2 rounded-full ${branch.isActive ? 'bg-success' : 'bg-border'}`} />
                        {branch.isActive ? 'Active' : 'Inactive'}
                      </span>
                      <button
                        type="button"
                        onClick={() => setExpandedBranchId(isExpanded ? null : branch.id)}
                        aria-expanded={isExpanded}
                        aria-controls={`branch-details-${branch.id}`}
                        className="inline-flex h-11 items-center gap-2 rounded-full bg-muted px-[18px] text-sm font-semibold text-foreground hover:bg-accent"
                      >
                        {isEditing ? <Pencil className="size-3.5" /> : null}
                        {isExpanded ? 'Hide details' : isEditing ? 'Edit details' : 'View details'}
                        <ChevronDown className={`size-3.5 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                      </button>
                    </div>
                  </div>

                  <div className="grid gap-2 text-xs sm:grid-cols-3">
                    <div className="rounded-xl bg-surface-panel px-3.5 py-3 ring-1 ring-border/40">
                      <p className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">Hours</p>
                      <p className="mt-0.5 font-medium text-foreground">{summarizeOpeningHours(branch)}</p>
                    </div>
                    <div className="rounded-xl bg-surface-panel px-3.5 py-3 ring-1 ring-border/40">
                      <p className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">Delivery fee</p>
                      <p className="mt-0.5 font-medium text-foreground">Rp {(branch.deliveryFeeIdr ?? 15000).toLocaleString('id-ID')}</p>
                    </div>
                    <div className={`rounded-xl px-3.5 py-3 ${branch.phone ? 'bg-surface-panel ring-1 ring-border/40' : 'bg-surface-panel ring-1 ring-border/30'}`}>
                      <p className={`text-2xs font-semibold uppercase tracking-wide ${branch.phone ? 'text-muted-foreground' : 'text-muted-foreground/40'}`}>WhatsApp</p>
                      <p className={branch.phone ? 'mt-0.5 truncate font-medium text-foreground' : 'mt-0.5 truncate text-muted-foreground/40'}>{branch.phone || 'Not added'}</p>
                    </div>
                  </div>

                  {impact?.blockingReasons.length ? (
                    <div className="flex items-start gap-2 rounded-lg bg-warning/10 px-3 py-2 text-xs text-warning ring-1 ring-warning/20">
                      <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                      <p>This branch has active dependencies and cannot be deactivated yet. Open details to review them.</p>
                    </div>
                  ) : null}
                </div>

                {isExpanded && (
                  <div id={`branch-details-${branch.id}`} className="space-y-4 border-t border-border/70 bg-surface-card p-3 sm:p-4">
                    <div>
                      <h4 className="text-xs font-semibold text-foreground">Branch information</h4>
                      <p className="text-xs text-muted-foreground">Identity, customer contact, and storefront delivery settings.</p>
                    </div>

                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {isEditing ? (
                        <>
                          <label className="space-y-1">
                            <span className="text-2xs font-semibold text-muted-foreground">Name</span>
                            <input value={branch.name} onChange={(event) => onUpdateBranch(branch.id, { name: event.target.value })} placeholder="Branch name" className={FIELD_CLASS} />
                            {validationErrors[`branch.${branchIndex}.name`] && <p className="text-2xs font-medium text-destructive">{validationErrors[`branch.${branchIndex}.name`]}</p>}
                          </label>
                          <label className="space-y-1">
                            <span className="flex items-center gap-1 text-2xs font-semibold text-muted-foreground">Code {impact?.codeLocked && <LockKeyhole className="size-3" />}</span>
                            <input disabled={Boolean(impact?.codeLocked)} value={branch.code} onChange={(event) => onUpdateBranch(branch.id, { code: event.target.value.toUpperCase() })} placeholder="KDM" className={`${FIELD_CLASS} disabled:cursor-not-allowed disabled:bg-muted`} />
                            {impact?.codeLocked && <p className="text-xs text-muted-foreground">Locked after the first order uses this branch.</p>}
                            {validationErrors[`branch.${branchIndex}.code`] && <p className="text-2xs font-medium text-destructive">{validationErrors[`branch.${branchIndex}.code`]}</p>}
                          </label>
                          <label className="space-y-1">
                            <span className="text-2xs font-semibold text-muted-foreground">Address</span>
                            <input value={branch.address} onChange={(event) => onUpdateBranch(branch.id, { address: event.target.value })} placeholder="Branch address" className={FIELD_CLASS} />
                          </label>
                          <label className="space-y-1">
                            <span className="text-2xs font-semibold text-muted-foreground">WhatsApp</span>
                            <input value={branch.phone} onChange={(event) => onUpdateBranch(branch.id, { phone: event.target.value })} placeholder="+62…" className={FIELD_CLASS} />
                          </label>
                          <label className="space-y-1 sm:col-span-2">
                            <span className="text-2xs font-semibold text-muted-foreground">Storefront delivery fee (IDR)</span>
                            <input type="number" min={0} step={1000} value={branch.deliveryFeeIdr ?? 15000} onChange={(event) => onUpdateBranch(branch.id, { deliveryFeeIdr: Math.max(0, Number(event.target.value) || 0) })} className={FIELD_CLASS} />
                            {validationErrors[`branch.${branchIndex}.deliveryFeeIdr`] && <p className="text-2xs font-medium text-destructive">{validationErrors[`branch.${branchIndex}.deliveryFeeIdr`]}</p>}
                          </label>
                        </>
                      ) : (
                        <>
                          <div><p className="text-2xs font-semibold text-muted-foreground">Name</p><p className="mt-0.5 text-sm font-medium text-foreground">{branch.name || '—'}</p></div>
                          <div><p className="text-2xs font-semibold text-muted-foreground">Code</p><p className="mt-0.5 text-sm font-medium text-foreground">{branch.code || '—'}</p></div>
                          <div><p className="text-2xs font-semibold text-muted-foreground">Address</p><p className="mt-0.5 text-sm font-medium text-foreground">{branch.address || 'Address not added'}</p></div>
                          <div><p className="text-2xs font-semibold text-muted-foreground">WhatsApp</p><p className="mt-0.5 text-sm font-medium text-foreground">{branch.phone || 'Not added'}</p></div>
                          <div className="sm:col-span-2"><p className="text-2xs font-semibold text-muted-foreground">Storefront delivery fee (IDR)</p><p className="mt-0.5 text-sm font-medium text-foreground">Rp {(branch.deliveryFeeIdr ?? 15000).toLocaleString('id-ID')}</p></div>
                        </>
                      )}
                    </div>

                    <BranchLocationEditor branch={branch} onUpdateBranch={onUpdateBranch} isEditing={isEditing} />
                    {validationErrors[`branch.${branchIndex}.location`] && <p className="text-2xs font-medium text-destructive">{validationErrors[`branch.${branchIndex}.location`]}</p>}
                    {Object.entries(validationErrors).filter(([key]) => key.startsWith(`branch.${branchIndex}.openingHours.`)).map(([key, message]) => <p key={key} className="text-2xs font-medium text-destructive">{message}</p>)}

                    {isEditing ? (
                      <OpeningHoursEditor branch={branch} onUpdateBranch={onUpdateBranch} />
                    ) : (
                      <OpeningHoursSummary branch={branch} />
                    )}

                    {impact && (
                      <details className={`rounded-lg px-3 py-2 text-2xs ring-1 ${impact.blockingReasons.length ? 'bg-warning/10 text-warning ring-warning/20' : 'bg-success/10 text-success ring-success/20'}`}>
                        <summary className="cursor-pointer font-semibold h-9 rounded-full px-3.5 gap-1.5 whitespace-nowrap">Operational impact</summary>
                        <p className="mt-1">{impact.activeEmployees} active employees · {impact.futureSchedules} schedules · {impact.activeOrders} active orders · {impact.stockUnits} stock units · {impact.activeTransfers} transfers</p>
                        {impact.blockingReasons.length > 0 && <ul className="mt-1 list-disc space-y-0.5 pl-4">{impact.blockingReasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>}
                      </details>
                    )}
                    {validationErrors[`branch.${branchIndex}.active`] && <p className="text-2xs font-medium text-destructive">{validationErrors[`branch.${branchIndex}.active`]}</p>}

                    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/70 pt-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs text-muted-foreground">id: {branch.id}</span>
                      </div>
                      <label className="flex items-center gap-2 text-xs font-medium text-foreground">
                        <span>{branch.isActive ? 'Active' : 'Inactive'}</span>
                        {isEditing ? (
                          <button type="button" role="switch" aria-label={`${branch.name || 'Branch'} active`} aria-checked={branch.isActive} disabled={branch.isActive && Boolean(impact && !impact.canDeactivate)} title={branch.isActive && impact && !impact.canDeactivate ? 'Resolve branch dependencies before deactivation.' : undefined} onClick={() => onSetBranchActive(branch.id, !branch.isActive)} className={`relative h-5 w-9 shrink-0 rounded-full transition disabled:cursor-not-allowed disabled:opacity-50 ${branch.isActive ? 'bg-primary' : 'bg-border'}`}>
                            <span className={`absolute left-0 top-0.5 size-4 rounded-full bg-white shadow transition-transform ${branch.isActive ? 'translate-x-[18px]' : 'translate-x-0.5'}`} />
                          </button>
                        ) : (
                          <span className={`h-2 w-2 rounded-full ${branch.isActive ? 'bg-success' : 'bg-border'}`} aria-hidden="true" />
                        )}
                      </label>
                    </div>
                  </div>
                )}
              </article>
            )
          })}
        </div>
      </section>
  )
}
