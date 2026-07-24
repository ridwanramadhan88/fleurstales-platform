import { describe, expect, it } from 'vitest'
import { getBranchSwitchDecision } from './branchSelectionDomain'

 describe('operational branch selection', () => {
  it('keeps the scheduled branch as a no-warning default', () => {
    expect(getBranchSwitchDecision({ role:'admin', scheduledBranchId:'Kedamaian', targetBranch:'Kedamaian' }))
      .toEqual({ allowed:true, requiresConfirmation:false })
  })

  it('requires confirmation for another branch without changing the schedule', () => {
    const result = getBranchSwitchDecision({ role:'florist', scheduledBranchId:'Kedamaian', targetBranch:'Pahoman' })
    expect(result).toMatchObject({ allowed:true, requiresConfirmation:true })
    expect(result.reason).toContain('scheduled at Kedamaian')
  })

  it('does not allow branch-scoped roles to use All as an operational branch', () => {
    expect(getBranchSwitchDecision({ role:'admin', scheduledBranchId:'Kedamaian', targetBranch:'All' }))
      .toMatchObject({ allowed:false, requiresConfirmation:false })
  })

  it('keeps Owner and Finance unrestricted', () => {
    expect(getBranchSwitchDecision({ role:'owner', scheduledBranchId:undefined, targetBranch:'All' }))
      .toEqual({ allowed:true, requiresConfirmation:false })
    expect(getBranchSwitchDecision({ role:'finance', scheduledBranchId:undefined, targetBranch:'Pahoman' }))
      .toEqual({ allowed:true, requiresConfirmation:false })
  })
})
