import { describe, expect, it } from 'vitest'
import { DEFAULT_ACTION_PERMISSIONS, guardActionPermissions, hasActionPermission } from './actionPermissions'
import { DEFAULT_ROLE_SECTION_ACCESS } from './permissions'

describe('action permissions', () => {
  it('keeps Admin out of sensitive Finance modules', () => {
    expect(hasActionPermission('admin','finance.view_collect_orders',DEFAULT_ACTION_PERMISSIONS,DEFAULT_ROLE_SECTION_ACCESS)).toBe(false)
    expect(hasActionPermission('admin','finance.view_payroll',DEFAULT_ACTION_PERMISSIONS,DEFAULT_ROLE_SECTION_ACCESS)).toBe(false)
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

  it('pins Settings actions to Owner only', () => {
    const matrix=structuredClone(DEFAULT_ACTION_PERMISSIONS)
    matrix.admin['settings.edit_permissions']=true
    const guarded=guardActionPermissions(matrix,DEFAULT_ROLE_SECTION_ACCESS)
    expect(guarded.owner['settings.edit_permissions']).toBe(true)
    expect(guarded.admin['settings.edit_permissions']).toBe(false)
  })
})
