import { beforeEach, describe, expect, it } from 'vitest'
import { useSettingsStore } from './settingsStore'
import { getBranchFilterOptions } from '../domain/settings/settingsSelectors'

beforeEach(() => {
  useSettingsStore.getState().resetSettings()
})

describe('settingsStore — store profile', () => {
  it('starts with the current app defaults so nothing regresses', () => {
    expect(useSettingsStore.getState().storeProfile.storeName).toBe(
      'Fleurstales Florist',
    )
  })

  it('patches only the given fields', () => {
    useSettingsStore.getState().updateStoreProfile({ storeName: 'New Name' })
    const profile = useSettingsStore.getState().storeProfile
    expect(profile.storeName).toBe('New Name')
    expect(profile.email).toBe('hello@fleurstales.com')
  })
})

describe('settingsStore — branches', () => {
  it('defaults to Kedamaian and Pahoman, both active', () => {
    const branches = useSettingsStore.getState().branches
    expect(branches.map((b) => b.id)).toEqual(['Kedamaian', 'Pahoman'])
    expect(branches.every((b) => b.isActive)).toBe(true)
  })

  it('adds a new branch', () => {
    useSettingsStore.getState().addBranch({
      id: 'branch-new',
      name: 'New Branch',
      code: 'NEW',
      address: '',
      phone: '',
      isActive: true,
    })
    expect(useSettingsStore.getState().branches).toHaveLength(3)
  })

  it('deactivating a branch removes it from branch filter options', () => {
    useSettingsStore.getState().setBranchActive('Pahoman', false)
    const branches = useSettingsStore.getState().branches
    expect(getBranchFilterOptions({ branches })).toEqual(['All', 'Kedamaian'])
  })

  it('reactivating a branch restores it to the filter options', () => {
    useSettingsStore.getState().setBranchActive('Pahoman', false)
    useSettingsStore.getState().setBranchActive('Pahoman', true)
    const branches = useSettingsStore.getState().branches
    expect(getBranchFilterOptions({ branches })).toEqual([
      'All',
      'Kedamaian',
      'Pahoman',
    ])
  })

  it('updateBranch patches fields without changing the id', () => {
    useSettingsStore.getState().updateBranch('Kedamaian', { name: 'Kedamaian Main' })
    const branch = useSettingsStore
      .getState()
      .branches.find((b) => b.id === 'Kedamaian')
    expect(branch?.name).toBe('Kedamaian Main')
    expect(branch?.id).toBe('Kedamaian')
  })
})

describe('settingsStore — staff & roles', () => {
  it('defaults to five roles with florist as default', () => {
    const staffRoles = useSettingsStore.getState().staffRoles
    expect(staffRoles.roles).toEqual(['owner', 'admin', 'finance', 'hr', 'florist'])
    expect(staffRoles.defaultRole).toBe('florist')
  })

  it('patches only the given fields', () => {
    useSettingsStore.getState().updateStaffRoles({ defaultRole: 'admin' })
    const staffRoles = useSettingsStore.getState().staffRoles
    expect(staffRoles.defaultRole).toBe('admin')
    expect(staffRoles.roles).toEqual(['owner', 'admin', 'finance', 'hr', 'florist'])
  })
})

describe('settingsStore — permissions', () => {
  it('seeds from the existing static role/section matrix', () => {
    const permissions = useSettingsStore.getState().permissions
    expect(permissions.owner.settings).toBe('edit')
    expect(permissions.admin.settings).toBe('none')
    expect(permissions.finance.finance).toBe('edit')
  })

  it('updateRoleSectionAccess patches a single cell', () => {
    useSettingsStore.getState().updateRoleSectionAccess('admin', 'revenue', 'view')
    expect(useSettingsStore.getState().permissions.admin.revenue).toBe('view')
  })

  it('never lets the settings section be edited away from owner', () => {
    useSettingsStore.getState().updateRoleSectionAccess('owner', 'settings', 'view')
    expect(useSettingsStore.getState().permissions.owner.settings).toBe('edit')
  })

  it('never lets the settings section be granted to a non-owner role', () => {
    useSettingsStore.getState().updateRoleSectionAccess('admin', 'settings', 'edit')
    expect(useSettingsStore.getState().permissions.admin.settings).toBe('none')
  })

  it('setPermissions applies the same settings-section guard', () => {
    const permissions = useSettingsStore.getState().permissions
    useSettingsStore.getState().setPermissions({
      ...permissions,
      finance: { ...permissions.finance, settings: 'edit' },
    })
    expect(useSettingsStore.getState().permissions.finance.settings).toBe('none')
  })
})

describe('settingsStore — atomic settings save', () => {
  it('replaces profile and payment methods in one applySettings write', () => {
    const current = useSettingsStore.getState()
    useSettingsStore.getState().applySettings({
      storeProfile: { ...current.storeProfile, storeName: 'Atomic Fleurstales' },
      branches: current.branches,
      attendance: current.attendance,
      scheduling: current.scheduling,
      staffRoles: current.staffRoles,
      permissions: current.permissions,
      payroll: current.payroll,
      paymentMethods: {
        bankAccounts: [{
          id: 'bank-new',
          bankName: 'Mandiri',
          accountNumber: '123456',
          accountHolder: 'Atomic Fleurstales',
          type: 'bank_transfer',
          isActive: true,
          isDefault: true,
          displayOrder: 0,
          isCustomerVisible: true,
          branchIds: [],
        }],
        paymentInstructions: 'Pay using the selected account.',
      },
    })

    const saved = useSettingsStore.getState()
    expect(saved.storeProfile.storeName).toBe('Atomic Fleurstales')
    expect(saved.paymentMethods.bankAccounts[0].bankName).toBe('Mandiri')
    expect(saved.paymentMethods.paymentInstructions).toMatch(/selected account/i)
  })
})

describe('settingsStore — section-level save', () => {
  it('updates only the requested section', () => {
    const state = useSettingsStore.getState()
    const before = {
      storeProfile: structuredClone(state.storeProfile),
      paymentMethods: structuredClone(state.paymentMethods),
      branches: structuredClone(state.branches),
    }
    useSettingsStore.getState().applySettingsSection('store-profile', {
      ...before.storeProfile,
      storeName: 'Section Saved Store',
    }, 'owner')

    const after = useSettingsStore.getState()
    expect(after.storeProfile.storeName).toBe('Section Saved Store')
    expect(after.paymentMethods).toEqual(before.paymentMethods)
    expect(after.branches).toEqual(before.branches)
  })

  it('keeps Owner Settings and Owner Scheduling safety guards on permission saves', () => {
    const state = useSettingsStore.getState()
    useSettingsStore.getState().applySettingsSection('permissions', {
      ...state.permissions,
      owner: { ...state.permissions.owner, scheduling: 'none' },
      admin: { ...state.permissions.admin, settings: 'edit', scheduling: 'view' },
    }, 'owner')

    expect(useSettingsStore.getState().permissions.admin.settings).toBe('none')
    expect(useSettingsStore.getState().permissions.owner.scheduling).toBe('edit')
    expect(useSettingsStore.getState().permissions.admin.scheduling).toBe('view')
  })
})
