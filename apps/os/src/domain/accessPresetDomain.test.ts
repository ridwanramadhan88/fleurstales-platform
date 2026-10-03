import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_ACTION_PERMISSIONS } from '../config/actionPermissions'
import { DEFAULT_ROLE_SECTION_ACCESS } from '../config/permissions'
import { getAccessExceptions, restoreRolePreset } from './accessPresetDomain'

const presets = () => ({
  permissions: structuredClone(DEFAULT_ROLE_SECTION_ACCESS),
  actions: structuredClone(DEFAULT_ACTION_PERMISSIONS),
})

describe('access presets (UX plan PR 7)', () => {
  it('a role on its preset has no exceptions', () => {
    const { permissions, actions } = presets()
    for (const role of ['owner', 'admin', 'finance', 'hr', 'florist'] as const) {
      expect(getAccessExceptions(role, permissions, actions)).toEqual([])
    }
  })

  it('lists only what the owner changed', () => {
    const { permissions, actions } = presets()
    permissions.hr.orders = 'none'
    actions.admin['orders.assign'] = false
    expect(getAccessExceptions('hr', permissions, actions)).toEqual([
      { kind: 'section', section: 'orders', preset: 'view', current: 'none' },
    ])
    expect(getAccessExceptions('admin', permissions, actions)).toEqual([
      expect.objectContaining({ kind: 'action', capability: 'orders.assign', preset: true, current: false }),
    ])
  })

  it('restores sections before actions, through the normal edit callbacks', () => {
    const { permissions, actions } = presets()
    permissions.admin.orders = 'view'
    actions.admin['orders.create'] = false
    const calls: string[] = []
    restoreRolePreset('admin', getAccessExceptions('admin', permissions, actions), {
      section: vi.fn((_role, section, level) => calls.push(`section ${section}=${level}`)),
      action: vi.fn((_role, capability, enabled) => calls.push(`action ${capability}=${enabled}`)),
    })
    expect(calls).toEqual(['section orders=edit', 'action orders.create=true'])
  })
})
