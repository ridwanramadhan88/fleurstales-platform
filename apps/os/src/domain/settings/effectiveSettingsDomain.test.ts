import { beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_OWNER_SETTINGS } from './defaultOwnerSettings'
import { resolveEffectiveRevision } from './effectiveSettingsDomain'
import { useSettingsStore } from '../../store/settingsStore'

beforeEach(() => useSettingsStore.getState().resetSettings())

describe('effective owner settings revisions', () => {
  it('resolves historical and future payroll configurations by activity date', () => {
    useSettingsStore.getState().savePayrollRevision({
      value: { ...DEFAULT_OWNER_SETTINGS.payroll, periodStartDay: 25, periodEndDay: 24 },
      effectiveFrom: '2026-09-01',
      reason: 'Move the future payroll cutoff',
      actor: 'Budi',
      actorRole: 'owner',
    })

    expect(useSettingsStore.getState().getPayrollSettingsForDate('2026-08-20').periodStartDay).toBe(21)
    expect(useSettingsStore.getState().getPayrollSettingsForDate('2026-09-01').periodStartDay).toBe(25)
  })

  it('closes the previous revision without rewriting its value', () => {
    useSettingsStore.getState().saveSchedulingRevision({
      value: structuredClone(DEFAULT_OWNER_SETTINGS.scheduling),
      effectiveFrom: '2026-08-01',
      reason: 'Future schedule revision',
      actor: 'Budi',
      actorRole: 'owner',
    })
    const revisions = useSettingsStore.getState().schedulingConfigRevisions
    expect(revisions[0].effectiveUntil).toBe('2026-07-31')
    expect(revisions[1].effectiveFrom).toBe('2026-08-01')
  })

  it('uses the fallback when no revision covers the requested date', () => {
    expect(resolveEffectiveRevision([], '2020-01-01', DEFAULT_OWNER_SETTINGS.payroll)).toEqual(DEFAULT_OWNER_SETTINGS.payroll)
  })
})
