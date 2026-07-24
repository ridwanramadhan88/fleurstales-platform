import type { FC } from 'react'
import { MapPinCheck } from 'lucide-react'
import type { AttendanceSettings } from '../../types/settings'
import { InfoDisclosure } from '../ui/info-disclosure'
import { SettingsCard, SettingsReadRow, SettingsSectionHeader } from './SettingsPrimitives'

interface Props {
  settings: AttendanceSettings
  isEditing: boolean
  onUpdate: (patch: Partial<AttendanceSettings>) => void
  validationErrors?: Record<string, string>
}

const FIELD_CLASS = 'h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/30 dark:focus:ring-primary/40'

export const AttendanceSettingsPanel: FC<Props> = ({ settings, isEditing, onUpdate, validationErrors: errors = {} }) => (
  <section className="space-y-5">
    <SettingsSectionHeader icon={MapPinCheck} title="Attendance rules" description="Location validation and grace windows used to create HR review warnings." />

    {!isEditing ? (
      <SettingsCard emphasis="primary">
        <div className="sm:grid sm:grid-cols-3 sm:divide-x sm:divide-border/60">
          <div className="sm:px-4 sm:first:pl-0"><SettingsReadRow label="Accepted location radius" value={`${settings.locationRadiusMeters.toLocaleString('id-ID')} meters`} /></div>
          <div className="sm:px-4"><SettingsReadRow label="Late grace period" value={`${settings.lateGraceMinutes} minutes`} /></div>
          <div className="sm:px-4 sm:last:pr-0"><SettingsReadRow label="Checkout grace period" value={`${settings.checkoutGraceMinutes} minutes`} /></div>
        </div>
      </SettingsCard>
    ) : (
      <SettingsCard className="grid gap-4 sm:grid-cols-3" emphasis="primary">
        <Field label="Accepted location radius" error={errors.attendanceRadius} suffix="meters">
          <input aria-label="Attendance location radius" type="number" min={10} max={5000} step={10} value={settings.locationRadiusMeters} onChange={(event) => onUpdate({ locationRadiusMeters: Number(event.target.value) })} className={FIELD_CLASS} />
        </Field>
        <Field label="Late grace period" error={errors.attendanceLateGrace} suffix="minutes">
          <input aria-label="Attendance late grace" type="number" min={0} max={180} value={settings.lateGraceMinutes} onChange={(event) => onUpdate({ lateGraceMinutes: Number(event.target.value) })} className={FIELD_CLASS} />
        </Field>
        <Field label="Checkout grace period" error={errors.attendanceCheckoutGrace} suffix="minutes">
          <input aria-label="Attendance checkout grace" type="number" min={0} max={240} value={settings.checkoutGraceMinutes} onChange={(event) => onUpdate({ checkoutGraceMinutes: Number(event.target.value) })} className={FIELD_CLASS} />
        </Field>
      </SettingsCard>
    )}

    <InfoDisclosure title="About attendance reviews">
      <p>Late and missing-checkout events create review cases. They do not affect points or payroll until HR reviews them.</p>
    </InfoDisclosure>
  </section>
)

const Field: FC<{ label: string; error?: string; suffix: string; children: React.ReactNode }> = ({ label, error, suffix, children }) => (
  <label className="space-y-1.5">
    <span className="text-xs font-medium">{label}</span>
    <div className="flex items-center gap-2">{children}<span className="text-xs text-muted-foreground">{suffix}</span></div>
    {error && <span className="text-xs text-destructive">{error}</span>}
  </label>
)
