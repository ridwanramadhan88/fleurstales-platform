import { describe, expect, it } from 'vitest'
import {
  getPrimaryMobileDestinationIds,
  getSecondaryMobileDestinationIds,
} from './mobileNavigation'

const financeAccessible = [
  'dashboard',
  'orders',
  'customers',
  'catalog',
  'stock',
  'finance',
  'revenue',
] as const

describe('Finance mobile navigation reachability', () => {
  it('puts Revenue in the four direct bottom destinations', () => {
    expect(getPrimaryMobileDestinationIds('finance', financeAccessible)).toEqual([
      'dashboard',
      'finance',
      'revenue',
      'orders',
    ])
  })

  it('keeps the remaining Finance tools in Workspace shortcuts', () => {
    expect(getSecondaryMobileDestinationIds('finance', financeAccessible)).toEqual([
      'customers',
      'catalog',
      'stock',
    ])
  })
})
