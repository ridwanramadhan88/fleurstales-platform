import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const settingsDir = join(process.cwd(), 'src/components/settings')
const schedulingSource = readFileSync(join(settingsDir, 'SchedulingSettingsPanel.tsx'), 'utf8')
const staffSource = readFileSync(join(settingsDir, 'StaffRoleSettingsPanel.tsx'), 'utf8')
const primitiveSource = readFileSync(join(settingsDir, 'SettingsPrimitives.tsx'), 'utf8')

describe('compact settings layout', () => {
  it('uses equal responsive coverage cells rather than split dividers', () => {
    expect(schedulingSource).toContain('grid gap-3 sm:grid-cols-2')
    expect(schedulingSource).toContain('compactSettingCardClass')
    expect(schedulingSource).not.toContain('sm:divide-x')
  })

  it('uses employee-id salary drafts in compact responsive rows', () => {
    expect(staffSource).toContain('md:grid-cols-2')
    expect(staffSource).toContain('onUpdateEmployeeSalaryDraft(employee.id, value)')
    expect(staffSource).toContain('compactValueRowClass')
  })

  it('keeps compact card and value-row styling in shared primitives', () => {
    expect(primitiveSource).toContain('compactSettingCardClass')
    expect(primitiveSource).toContain('compactValueRowClass')
  })
})
