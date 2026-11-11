import { describe, expect, it } from 'vitest'
import type { BranchSettings } from '../types/settings'
import { branchOperationsKey, changedBranchOperations, clampCoverage } from './branchOperationsDomain'

const branch = (id: string, patch: Partial<BranchSettings> = {}): BranchSettings => ({
  id, name: id, code: id.toUpperCase(), address: 'Jl. A', phone: '', isActive: true, ...patch,
})

describe('branch operations', () => {
  it('reports only branches whose operational fields changed', () => {
    const saved = [branch('a'), branch('b', { deliveryFeeIdr: 10000 })]
    const draft = [branch('a', { name: 'Renamed' }), branch('b', { deliveryFeeIdr: 15000 })]
    expect(changedBranchOperations(saved, draft).map((item) => item.id)).toEqual(['b'])
  })

  it('treats a missing fee as zero', () => {
    expect(branchOperationsKey(branch('a'))).toBe(branchOperationsKey(branch('a', { deliveryFeeIdr: 0 })))
  })

  it('clamps staff coverage to whole numbers from 0 to 50', () => {
    expect([clampCoverage(-3), clampCoverage(2.9), clampCoverage(80), clampCoverage(Number.NaN)]).toEqual([0, 2, 50, 0])
  })
})
