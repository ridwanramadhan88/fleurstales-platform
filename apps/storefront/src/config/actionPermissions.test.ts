import { describe, expect, it } from 'vitest'
import { DEFAULT_ACTION_PERMISSIONS, guardActionPermissions, hasActionPermission } from './actionPermissions'
import { DEFAULT_ROLE_SECTION_ACCESS } from './permissions'

describe('action permissions', () => {
  it('keeps Admin out of sensitive Finance modules', () => {
    expect(hasActionPermission('admin','finance.view_collect_orders',DEFAULT_ACTION_PERMISSIONS,DEFAULT_ROLE_SECTION_ACCESS)).toBe(false)
    expect(hasActionPermission('admin','finance.view_payroll',DEFAULT_ACTION_PERMISSIONS,DEFAULT_ROLE_SECTION_ACCESS)).toBe(false)
  })

  it('keeps Orders capabilities aligned to each role', () => {
    expect(hasActionPermission('admin','orders.assign',DEFAULT_ACTION_PERMISSIONS,DEFAULT_ROLE_SECTION_ACCESS)).toBe(true)
    expect(hasActionPermission('admin','orders.advance_status',DEFAULT_ACTION_PERMISSIONS,DEFAULT_ROLE_SECTION_ACCESS)).toBe(true)
    expect(hasActionPermission('florist','orders.read_assigned',DEFAULT_ACTION_PERMISSIONS,DEFAULT_ROLE_SECTION_ACCESS)).toBe(true)
    expect(hasActionPermission('florist','orders.advance_status',DEFAULT_ACTION_PERMISSIONS,DEFAULT_ROLE_SECTION_ACCESS)).toBe(false)
    expect(hasActionPermission('finance','orders.read_all',DEFAULT_ACTION_PERMISSIONS,DEFAULT_ROLE_SECTION_ACCESS)).toBe(true)
    expect(hasActionPermission('finance','orders.edit',DEFAULT_ACTION_PERMISSIONS,DEFAULT_ROLE_SECTION_ACCESS)).toBe(false)
  })

  it('does not grant Florist any Finance capability', () => {
    expect(DEFAULT_ACTION_PERMISSIONS.florist['finance.view_collect_orders']).toBe(false)
    expect(hasActionPermission('florist','finance.view_collect_orders',DEFAULT_ACTION_PERMISSIONS,DEFAULT_ROLE_SECTION_ACCESS)).toBe(false)
  })

  it('blocks actions when parent section access is removed', () => {
    const sections=structuredClone(DEFAULT_ROLE_SECTION_ACCESS)
    sections.finance.finance='none'
    expect(hasActionPermission('finance','finance.record_final_payment',DEFAULT_ACTION_PERMISSIONS,sections)).toBe(false)
  })

  it('ignores runtime attempts to grant capabilities outside the hard role floor', () => {
    const matrix=structuredClone(DEFAULT_ACTION_PERMISSIONS)
    matrix.finance['orders.edit']=true
    matrix.florist['orders.advance_status']=true

    expect(hasActionPermission('finance','orders.edit',matrix,DEFAULT_ROLE_SECTION_ACCESS)).toBe(false)
    expect(hasActionPermission('florist','orders.advance_status',matrix,DEFAULT_ROLE_SECTION_ACCESS)).toBe(false)

    const guarded=guardActionPermissions(matrix,DEFAULT_ROLE_SECTION_ACCESS)
    expect(guarded.finance['orders.edit']).toBe(false)
    expect(guarded.florist['orders.advance_status']).toBe(false)
  })

  it('pins Settings actions to Owner only', () => {
    const matrix=structuredClone(DEFAULT_ACTION_PERMISSIONS)
    matrix.admin['settings.edit_permissions']=true
    const guarded=guardActionPermissions(matrix,DEFAULT_ROLE_SECTION_ACCESS)
    expect(guarded.owner['settings.edit_permissions']).toBe(true)
    expect(guarded.admin['settings.edit_permissions']).toBe(false)
  })
})
