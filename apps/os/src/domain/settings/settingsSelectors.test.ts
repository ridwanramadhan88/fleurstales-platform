import { describe, expect, it } from 'vitest'
import {
  getActiveBranches,
  getBranchDisplayName,
  getBranchFilterOptions,
} from './settingsSelectors'
import type { BranchSettings } from '../../types/settings'

const makeBranch = (overrides: Partial<BranchSettings> = {}): BranchSettings => ({
  id: 'branch-1',
  name: 'Branch One',
  code: 'B1',
  address: '',
  phone: '',
  isActive: true,
  ...overrides,
})

describe('getActiveBranches', () => {
  it('returns only branches marked active', () => {
    const branches = [
      makeBranch({ id: 'a', isActive: true }),
      makeBranch({ id: 'b', isActive: false }),
      makeBranch({ id: 'c', isActive: true }),
    ]

    expect(getActiveBranches({ branches }).map((b) => b.id)).toEqual(['a', 'c'])
  })
})

describe('getBranchFilterOptions', () => {
  it('prefixes active branch ids with All', () => {
    const branches = [
      makeBranch({ id: 'Kedamaian', isActive: true }),
      makeBranch({ id: 'Pahoman', isActive: true }),
    ]

    expect(getBranchFilterOptions({ branches })).toEqual([
      'All',
      'Kedamaian',
      'Pahoman',
    ])
  })

  it('excludes inactive branches from the filter options', () => {
    const branches = [
      makeBranch({ id: 'Kedamaian', isActive: true }),
      makeBranch({ id: 'Pahoman', isActive: false }),
    ]

    expect(getBranchFilterOptions({ branches })).toEqual(['All', 'Kedamaian'])
  })

  it('reflects a newly added active branch', () => {
    const branches = [
      makeBranch({ id: 'Kedamaian', isActive: true }),
      makeBranch({ id: 'NewBranch', isActive: true }),
    ]

    expect(getBranchFilterOptions({ branches })).toContain('NewBranch')
  })
})

describe('getBranchDisplayName', () => {
  it('returns the branch name for a known id', () => {
    const branches = [makeBranch({ id: 'Kedamaian', name: 'Kedamaian HQ' })]
    expect(getBranchDisplayName({ branches }, 'Kedamaian')).toBe('Kedamaian HQ')
  })

  it('falls back to the raw id for an unknown/removed branch', () => {
    const branches = [makeBranch({ id: 'Kedamaian' })]
    expect(getBranchDisplayName({ branches }, 'OldBranch')).toBe('OldBranch')
  })
})
