import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DEFAULT_COMPANY_WEEKLY_SCHEDULE } from '../../domain/hrSchedulingDomain'

const hrDir = join(process.cwd(), 'src/components/hr')
const storeDir = join(process.cwd(), 'src/store')
const dataDir = join(process.cwd(), 'src/data')

const containerSource = readFileSync(join(hrDir, 'HrTabContentContainer.tsx'), 'utf8')
const removalSource = readFileSync(join(hrDir, 'EmployeeRemovalControl.tsx'), 'utf8')
const accessMutationSource = readFileSync(join(storeDir, 'hrManagedEmployeeAccessMutation.ts'), 'utf8')
const lifecycleSource = readFileSync(join(dataDir, 'staffLifecycleSupabase.ts'), 'utf8')

describe('HR account administration regressions', () => {
  it('keeps Sunday open by following branch hours', () => {
    expect(DEFAULT_COMPANY_WEEKLY_SCHEDULE.sunday).toMatchObject({
      mode: 'follow_branch_hours',
      isWorking: true,
    })
  })

  it('enables credential editing for HR while keeping managed-role checks', () => {
    expect(containerSource).toContain("role === 'hr' && viewModel.canManageEmployeeDetails")
    expect(accessMutationSource).toContain("actor.role !== 'hr'")
    expect(accessMutationSource).toContain('isHrManagedEmployeeRole')
    expect(accessMutationSource).toContain("employee.systemRole === 'owner'")
  })

  it('offers an explicit force-resolve removal path', () => {
    expect(removalSource).toContain('Force resolve linked records')
    expect(removalSource).toContain("removeStaffEmployeeSupabase(employee.id, reason.trim(), forceResolve)")
    expect(lifecycleSource).toContain('forceResolve=false')
    expect(lifecycleSource).toContain("body:{ action:'remove', employeeId, reason, forceResolve }")
  })
})
