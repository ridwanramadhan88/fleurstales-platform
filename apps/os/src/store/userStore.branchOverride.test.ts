import { beforeEach, describe, expect, it } from 'vitest'
import { useUserStore } from './userStore'

beforeEach(() => {
  useUserStore.getState().signIn({
    employeeId:'emp-admin', name:'Admin', username:'admin', role:'admin',
    branchId:'Kedamaian', scheduledBranchId:'Kedamaian',
  })
})

describe('session operational branch override', () => {
  it('changes row scope without changing the scheduled branch', () => {
    useUserStore.getState().setOperationalBranch('Pahoman', '2026-07-15')
    expect(useUserStore.getState()).toMatchObject({
      branchId:'Pahoman',
      scheduledBranchId:'Kedamaian',
      branchOverrideActive:true,
      lastBranchOverride:{ scheduledBranchId:'Kedamaian', selectedBranchId:'Pahoman', date:'2026-07-15' },
    })
  })

  it('clears the active override when returning to the scheduled branch', () => {
    useUserStore.getState().setOperationalBranch('Pahoman', '2026-07-15')
    useUserStore.getState().setOperationalBranch('Kedamaian', '2026-07-15')
    expect(useUserStore.getState()).toMatchObject({ branchId:'Kedamaian', branchOverrideActive:false })
    expect(useUserStore.getState().lastBranchOverride).toBeUndefined()
  })
})
