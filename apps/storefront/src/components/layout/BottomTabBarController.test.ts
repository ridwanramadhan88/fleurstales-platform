import { describe, expect, it } from 'vitest'
import { BarChart3, Home, ReceiptText } from 'lucide-react'
import {
  getBottomNavigationActiveTab,
  getVisibleBottomNavigationDestinationIds,
  type BottomTabItem,
} from './BottomTabBarController'

const tabs: BottomTabItem[] = [
  { id: 'dashboard', label: 'Overview', icon: Home },
  { id: 'orders', label: 'Orders', icon: ReceiptText },
]

describe('bottom navigation context', () => {
  it('keeps the direct destination active', () => {
    expect(getBottomNavigationActiveTab('orders', tabs)).toBe('orders')
  })

  it('uses Overview as the context for secondary workspace destinations', () => {
    expect(getBottomNavigationActiveTab('settings', tabs)).toBe('dashboard')
  })

  it('keeps Revenue reachable as a direct Finance bottom tab', () => {
    const financeTabs: BottomTabItem[] = [
      ...tabs,
      { id: 'revenue', label: 'Revenue', icon: BarChart3 },
    ]
    expect(getBottomNavigationActiveTab('revenue', financeTabs)).toBe('revenue')
  })

  it('builds the Finance mobile tabs with Revenue included', () => {
    expect(
      getVisibleBottomNavigationDestinationIds('finance', [
        'dashboard',
        'orders',
        'customers',
        'catalog',
        'stock',
        'finance',
        'revenue',
      ]),
    ).toEqual(['dashboard', 'finance', 'revenue', 'orders'])
  })
})
