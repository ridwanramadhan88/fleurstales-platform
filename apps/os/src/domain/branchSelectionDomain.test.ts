import { describe, expect, it } from 'vitest'
import { getBranchSwitchDecision, isOperationalBranchRole } from './branchSelectionDomain'

describe('branch selection semantics', () => {
  it('lets Admin browse any branch or All without changing operational authority', () => {
    expect(getBranchSwitchDecision({ role:'admin', scheduledBranchId:'Kedamaian', targetBranch:'Kedamaian' }))
      .toEqual({ allowed:true, requiresConfirmation:false })
    expect(getBranchSwitchDecision({ role:'admin', scheduledBranchId:'Kedamaian', targetBranch:'Pahoman' }))
      .toEqual({ allowed:true, requiresConfirmation:false })
    expect(getBranchSwitchDecision({ role:'admin', scheduledBranchId:'Kedamaian', targetBranch:'All' }))
      .toEqual({ allowed:true, requiresConfirmation:false })
    expect(isOperationalBranchRole('admin')).toBe(false)
  })

  it('allows Admin browsing even without a dated branch assignment', () => {
    expect(getBranchSwitchDecision({ role:'admin', scheduledBranchId:undefined, targetBranch:'All' }))
      .toEqual({ allowed:true, requiresConfirmation:false })
  })

  it('keeps the Florist operational override confirmation', () => {
    const result = getBranchSwitchDecision({ role:'florist', scheduledBranchId:'Kedamaian', targetBranch:'Pahoman' })
    expect(result).toMatchObject({ allowed:true, requiresConfirmation:true })
    expect(result.reason).toContain('scheduled at Kedamaian')
    expect(isOperationalBranchRole('florist')).toBe(true)
  })

  it('does not allow Florist to use All as an operational branch', () => {
    expect(getBranchSwitchDecision({ role:'florist', scheduledBranchId:'Kedamaian', targetBranch:'All' }))
      .toMatchObject({ allowed:false, requiresConfirmation:false })
  })

  it('keeps Owner, Finance, and HR browsing unrestricted', () => {
    expect(getBranchSwitchDecision({ role:'owner', scheduledBranchId:undefined, targetBranch:'All' }))
      .toEqual({ allowed:true, requiresConfirmation:false })
    expect(getBranchSwitchDecision({ role:'finance', scheduledBranchId:undefined, targetBranch:'Pahoman' }))
      .toEqual({ allowed:true, requiresConfirmation:false })
    expect(getBranchSwitchDecision({ role:'hr', scheduledBranchId:undefined, targetBranch:'All' }))
      .toEqual({ allowed:true, requiresConfirmation:false })
  })
})
