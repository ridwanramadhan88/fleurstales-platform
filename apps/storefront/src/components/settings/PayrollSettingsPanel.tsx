import type { FC } from 'react'
import { CalendarDays } from 'lucide-react'
import type { PayrollDefaultSettings } from '../../types/settings'
import type { SettingsValidationErrors } from '../../domain/settings/settingsValidation'
import type { PayrollSettingsRevision } from '../../domain/settings/effectiveSettingsDomain'
import { SettingsCard, SettingsSectionHeader } from './SettingsPrimitives'

interface Props {
  isEditing: boolean
  settings: PayrollDefaultSettings
  validationErrors: SettingsValidationErrors
  onUpdate: (patch: Partial<PayrollDefaultSettings>) => void
  effectiveFrom: string
  minimumEffectiveDate: string
  changeReason: string
  revisions: PayrollSettingsRevision[]
  onEffectiveFromChange: (value: string) => void
  onChangeReasonChange: (value: string) => void
}

const FIELD_CLASS = 'h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/30 dark:focus:ring-primary/40'

const EditableDayField: FC<{ label: string; value: number; error?: string; onChange: (value: number) => void }> = ({ label, value, error, onChange }) => (
  <label className="space-y-1.5">
    <span className="text-xs font-medium text-muted-foreground">{label}</span>
    <input type="number" min={1} max={28} value={value} onChange={(event) => onChange(Number(event.target.value))} className={`${FIELD_CLASS} ${error ? 'border-destructive ring-2 ring-destructive/20' : ''}`} />
    {error && <span className="block text-xs text-destructive">{error}</span>}
  </label>
)

const ReadDay: FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="border-b border-border/60 py-3 last:border-b-0 sm:rounded-xl sm:border-b-0 sm:bg-muted/35 sm:px-3 sm:ring-1 sm:ring-border/60"><p className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p><p className="mt-1 text-sm font-semibold text-foreground">{value}</p></div>
)

export const PayrollSettingsPanel: FC<Props> = ({ isEditing, settings, validationErrors, onUpdate, effectiveFrom, minimumEffectiveDate, changeReason, revisions, onEffectiveFromChange, onChangeReasonChange }) => (
  <section className="space-y-5">
    <SettingsSectionHeader icon={CalendarDays} title="Payroll cycle rules" description="Defaults for future monthly payroll periods. Generated periods keep their original dates." />

    {isEditing && (
      <section className="rounded-xl border border-primary/20 bg-primary/5 p-4">
        <h3 className="text-sm font-semibold leading-5">New revision details</h3>
        <p className="mt-1 text-xs text-muted-foreground">The saved configuration applies to future payroll periods only.</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="space-y-1.5"><span className="text-xs font-medium">Effective from</span><input type="date" min={minimumEffectiveDate} value={effectiveFrom} onChange={(event) => onEffectiveFromChange(event.target.value)} className={FIELD_CLASS} />{validationErrors['payroll.effectiveFrom'] && <span className="block text-xs text-destructive">{validationErrors['payroll.effectiveFrom']}</span>}</label>
          <label className="space-y-1.5"><span className="text-xs font-medium">Change reason</span><input value={changeReason} onChange={(event) => onChangeReasonChange(event.target.value)} placeholder="Why is this cycle changing?" className={FIELD_CLASS} />{validationErrors['payroll.changeReason'] && <span className="block text-xs text-destructive">{validationErrors['payroll.changeReason']}</span>}</label>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">Earliest safe date: {minimumEffectiveDate}</p>
      </section>
    )}

    <SettingsCard emphasis="primary">
      <p className="text-xs font-semibold text-muted-foreground">Point conversion</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
        <div className="space-y-1.5">
          <span className="text-xs font-medium">Value of 1 point</span>
          {isEditing ? (
            <div className="flex h-10 overflow-hidden rounded-lg border border-border bg-background"><span className="flex items-center border-r border-border px-3 text-sm text-muted-foreground">Rp</span><input type="number" min={1} max={1000000} step={100} value={settings.pointValueIdr} onChange={(event) => onUpdate({ pointValueIdr: Number(event.target.value) })} className="min-w-0 flex-1 bg-transparent px-3 text-sm outline-none" /></div>
          ) : (
            <p className="text-base font-semibold leading-6 text-foreground">Rp {settings.pointValueIdr.toLocaleString('id-ID')}</p>
          )}
          {validationErrors['payroll.pointValueIdr'] && <span className="block text-xs text-destructive">{validationErrors['payroll.pointValueIdr']}</span>}
        </div>
        <p className="pb-2 text-xs text-muted-foreground">10 points = Rp {Math.round(settings.pointValueIdr * 10).toLocaleString('id-ID')}</p>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">The monthly payable point bonus remains capped at Rp 500.000 per staff.</p>
    </SettingsCard>

    <section className="rounded-2xl border border-primary/20 bg-primary/5 px-4 py-3 shadow-sm">
      <h3 className="text-sm font-semibold leading-5">Employee base salaries</h3>
      <p className="mt-1 text-xs text-muted-foreground">Configured individually in Settings → Staff & Roles. Role-based salary defaults are not used.</p>
    </section>

    {isEditing ? (
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <EditableDayField label="Period start day (previous month)" value={settings.periodStartDay} error={validationErrors['payroll.periodStartDay']} onChange={(value) => onUpdate({ periodStartDay: value })} />
        <EditableDayField label="Period end day" value={settings.periodEndDay} error={validationErrors['payroll.periodEndDay']} onChange={(value) => onUpdate({ periodEndDay: value })} />
        <EditableDayField label="HR submission deadline" value={settings.hrSubmissionDay} error={validationErrors['payroll.hrSubmissionDay']} onChange={(value) => onUpdate({ hrSubmissionDay: value })} />
        <EditableDayField label="Finance review deadline" value={settings.financeReviewDay} error={validationErrors['payroll.financeReviewDay']} onChange={(value) => onUpdate({ financeReviewDay: value })} />
        <EditableDayField label="Payment date" value={settings.paymentDay} error={validationErrors['payroll.paymentDay']} onChange={(value) => onUpdate({ paymentDay: value })} />
        <ReadDay label="Timezone" value="Asia/Jakarta" />
      </section>
    ) : (
      <section className="divide-y divide-border/60 rounded-2xl border border-border/70 bg-card px-4 shadow-sm sm:grid sm:grid-cols-2 sm:gap-3 sm:divide-y-0 sm:bg-transparent sm:px-0 sm:ring-0 lg:grid-cols-3">
        <ReadDay label="Period start" value={`Day ${settings.periodStartDay} of previous month`} />
        <ReadDay label="Period end" value={`Day ${settings.periodEndDay}`} />
        <ReadDay label="HR submission deadline" value={`Day ${settings.hrSubmissionDay}`} />
        <ReadDay label="Finance review deadline" value={`Day ${settings.financeReviewDay}`} />
        <ReadDay label="Payment date" value={`Day ${settings.paymentDay}`} />
        <ReadDay label="Timezone" value="Asia/Jakarta" />
      </section>
    )}

    <SettingsCard className="text-sm" emphasis="secondary">
      <p className="font-semibold">Default monthly cycle</p>
      <div className="mt-3 grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
        <p>Earning period: day {settings.periodStartDay} previous month – day {settings.periodEndDay}</p><p>HR deadline: day {settings.hrSubmissionDay}</p><p>Finance deadline: day {settings.financeReviewDay}</p><p>Payment date: day {settings.paymentDay}</p>
      </div>
    </SettingsCard>

    <SettingsCard emphasis="secondary">
      <h3 className="text-sm font-semibold leading-5">Configuration history</h3>
      <div className="mt-3 space-y-2">{[...revisions].sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom)).slice(0, 5).map((revision) => <div key={revision.id} className="rounded-lg bg-muted/40 px-3 py-2 text-xs"><div className="flex justify-between gap-3"><span className="font-medium">From {revision.effectiveFrom}</span><span className="text-muted-foreground">{revision.effectiveUntil ? `until ${revision.effectiveUntil}` : 'current/future'}</span></div><p className="mt-1 text-muted-foreground">{revision.changeReason} · {revision.createdBy}</p></div>)}</div>
    </SettingsCard>
  </section>
)
