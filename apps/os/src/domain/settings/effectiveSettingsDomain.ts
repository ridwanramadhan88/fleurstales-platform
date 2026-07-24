import type { PayrollDefaultSettings, SchedulingSettings } from '../../types/settings'

export interface SettingsRevision<T> {
  id: string
  effectiveFrom: string
  effectiveUntil?: string
  value: T
  createdAt: string
  createdBy: string
  changeReason: string
}

export const resolveEffectiveRevision = <T>(
  revisions: SettingsRevision<T>[],
  date: string,
  fallback: T,
): T => {
  const match = revisions
    .filter((revision) => revision.effectiveFrom <= date && (!revision.effectiveUntil || revision.effectiveUntil >= date))
    .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0]
  return match?.value ?? fallback
}

export const closePreviousRevision = <T>(
  revisions: SettingsRevision<T>[],
  effectiveFrom: string,
): SettingsRevision<T>[] => {
  const previousDay = new Date(`${effectiveFrom}T00:00:00Z`)
  previousDay.setUTCDate(previousDay.getUTCDate() - 1)
  const effectiveUntil = previousDay.toISOString().slice(0, 10)
  return revisions.map((revision) =>
    revision.effectiveFrom < effectiveFrom && (!revision.effectiveUntil || revision.effectiveUntil >= effectiveFrom)
      ? { ...revision, effectiveUntil }
      : revision,
  )
}

export type PayrollSettingsRevision = SettingsRevision<PayrollDefaultSettings>
export type SchedulingSettingsRevision = SettingsRevision<SchedulingSettings>
