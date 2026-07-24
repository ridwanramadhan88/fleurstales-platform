import type { FC } from 'react'
import { CalendarClock } from 'lucide-react'
import { TimeSelectField } from '../ui/date-time-field'
import { WEEKDAY_KEYS, WEEKDAY_LABELS } from '../../domain/branchOpeningHoursDomain'
import type { SchedulingSettings } from '../../types/settings'
import type { SettingsValidationErrors } from '../../domain/settings/settingsValidation'
import type { SchedulingSettingsRevision } from '../../domain/settings/effectiveSettingsDomain'
import { compactSettingCardClass, SettingsCard, SettingsSectionHeader } from './SettingsPrimitives'

interface Props {
  isEditing: boolean
  settings: SchedulingSettings
  onUpdate: (patch: Partial<SchedulingSettings>) => void
  validationErrors: SettingsValidationErrors
  effectiveFrom: string
  changeReason: string
  revisions: SchedulingSettingsRevision[]
  impact: { inheritedFutureShifts: number; invalidCustomShifts: number }
  onEffectiveFromChange: (value: string) => void
  onChangeReasonChange: (value: string) => void
}

const FIELD_CLASS = 'h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/30 dark:focus:ring-primary/40'

export const SchedulingSettingsPanel: FC<Props> = ({ isEditing, settings, onUpdate, validationErrors, effectiveFrom, changeReason, revisions, impact, onEffectiveFromChange, onChangeReasonChange }) => {
  const updateDay = (day: keyof SchedulingSettings['defaultWeeklySchedule'], patch: Partial<SchedulingSettings['defaultWeeklySchedule'][typeof day]>) => {
    onUpdate({ defaultWeeklySchedule: { ...settings.defaultWeeklySchedule, [day]: { ...settings.defaultWeeklySchedule[day], ...patch } } })
  }

  return (
    <section className="space-y-5">
      <SettingsSectionHeader icon={CalendarClock} title="Default scheduling rules" description="Company fallback week and minimum staffing coverage." />

      {isEditing && (
        <div className="space-y-3 rounded-xl border border-primary/20 bg-primary/5 p-4">
          <div><h3 className="text-sm font-semibold leading-5">New revision details</h3><p className="text-xs text-muted-foreground">The saved change applies to future schedules only.</p></div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1"><span className="text-xs font-medium">Effective from</span><input type="date" value={effectiveFrom} onChange={(event) => onEffectiveFromChange(event.target.value)} className={FIELD_CLASS} />{validationErrors['scheduling.effectiveFrom'] && <span className="block text-xs text-destructive">{validationErrors['scheduling.effectiveFrom']}</span>}</label>
            <label className="space-y-1"><span className="text-xs font-medium">Change reason</span><input value={changeReason} onChange={(event) => onChangeReasonChange(event.target.value)} placeholder="Why is the default schedule changing?" className={FIELD_CLASS} />{validationErrors['scheduling.changeReason'] && <span className="block text-xs text-destructive">{validationErrors['scheduling.changeReason']}</span>}</label>
          </div>
          <div className="grid gap-2 text-xs sm:grid-cols-2"><p className="rounded-lg bg-background p-2 ring-1 ring-border">{impact.inheritedFutureShifts} future branch-hour shifts will resolve using this revision.</p><p className="rounded-lg bg-background p-2 ring-1 ring-border">{impact.invalidCustomShifts} custom future shifts currently need review.</p></div>
        </div>
      )}

      <SettingsCard className="space-y-4" emphasis="primary">
        <div><h3 className="text-sm font-semibold leading-5">Minimum daily coverage</h3><p className="text-xs text-muted-foreground">Used by HR to spot understaffed branches before publishing a week.</p></div>
        <div className="grid gap-3 sm:grid-cols-2">
          <CoverageSetting
            label="Admin per open branch"
            value={settings.minimumCoverage?.admin ?? 1}
            isEditing={isEditing}
            error={validationErrors['scheduling.minimumCoverage.admin']}
            onChange={(admin) => onUpdate({ minimumCoverage: { admin, florist: settings.minimumCoverage?.florist ?? 2 } })}
          />
          <CoverageSetting
            label="Florist per open branch"
            value={settings.minimumCoverage?.florist ?? 2}
            isEditing={isEditing}
            error={validationErrors['scheduling.minimumCoverage.florist']}
            onChange={(florist) => onUpdate({ minimumCoverage: { admin: settings.minimumCoverage?.admin ?? 1, florist } })}
          />
        </div>
      </SettingsCard>

      <SettingsCard className="space-y-4" emphasis="secondary">
        <div><h3 className="text-sm font-semibold leading-5">Company default week</h3><p className="text-xs text-muted-foreground">Used until HR saves a personal default schedule for an employee.</p></div>
        <div className="space-y-2">
          {WEEKDAY_KEYS.map((day) => {
            const value = settings.defaultWeeklySchedule[day]
            const error = validationErrors[`scheduling.default.${day}`]
            const mode = value.mode ?? (value.isWorking ? 'follow_branch_hours' : 'off')
            return (
              <div key={day} className="grid min-h-14 gap-2 rounded-xl bg-muted/30 px-3 py-3 ring-1 ring-border/45 sm:grid-cols-[8rem_11rem_1fr_1fr] sm:items-center">
                <span className="text-xs font-semibold">{WEEKDAY_LABELS[day]}</span>
                {isEditing ? (
                  <>
                    <select value={mode} onChange={(event) => { const nextMode = event.target.value as 'follow_branch_hours' | 'custom' | 'off'; updateDay(day, { mode: nextMode, isWorking: nextMode !== 'off' }) }} className="h-9 rounded-full bg-background px-2 text-xs ring-1 ring-border">
                      <option value="follow_branch_hours">Follow branch hours</option><option value="custom">Custom hours</option><option value="off">Day off</option>
                    </select>
                    {mode === 'custom' ? <><TimeSelectField value={value.startTime} onChange={(startTime) => updateDay(day, { startTime })} className="h-9 rounded-lg" /><TimeSelectField value={value.endTime} onChange={(endTime) => updateDay(day, { endTime })} className="h-9 rounded-lg" /></> : <p className="text-xs text-muted-foreground sm:col-span-2">{value.isWorking ? 'Uses the selected branch opening and closing time.' : 'No shift is generated.'}</p>}
                  </>
                ) : (
                  <p className="text-xs font-medium text-foreground sm:col-span-3">{mode === 'off' ? 'Day off' : mode === 'custom' ? `Custom hours · ${value.startTime}–${value.endTime}` : 'Follow branch hours'}</p>
                )}
                {error && <p className="text-xs text-destructive sm:col-span-4">{error}</p>}
              </div>
            )
          })}
        </div>
      </SettingsCard>

      <History revisions={revisions} />
    </section>
  )
}

const History: FC<{ revisions: SchedulingSettingsRevision[] }> = ({ revisions }) => (
  <section className="rounded-2xl border border-border/70 bg-card p-4 shadow-sm sm:p-5"><h3 className="text-base font-semibold leading-6">Configuration history</h3><div className="mt-3 space-y-2">{[...revisions].sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom)).slice(0, 5).map((revision) => <div key={revision.id} className="rounded-lg bg-muted/40 px-3 py-2 text-xs"><div className="flex justify-between gap-3"><span className="font-medium">From {revision.effectiveFrom}</span><span className="text-muted-foreground">{revision.effectiveUntil ? `until ${revision.effectiveUntil}` : 'current/future'}</span></div><p className="mt-1 text-muted-foreground">{revision.changeReason} · {revision.createdBy}</p></div>)}</div></section>
)


const CoverageSetting: FC<{ label: string; value: number; isEditing: boolean; error?: string; onChange: (value: number) => void }> = ({ label, value, isEditing, error, onChange }) => (
  <label className={compactSettingCardClass(Boolean(error))}>
    <span className="block text-xs font-medium text-muted-foreground">{label}</span>
    {isEditing ? (
      <input aria-label={label} type="number" min={0} max={50} value={value} onChange={(event) => onChange(Number(event.target.value))} className={`${FIELD_CLASS} mt-2 max-w-28 bg-card text-base font-semibold`} />
    ) : (
      <span className="mt-2 block text-2xl font-semibold leading-none text-foreground">{value}</span>
    )}
    {error && <span className="mt-1.5 block text-xs text-destructive">{error}</span>}
  </label>
)
