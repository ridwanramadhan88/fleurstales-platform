import { describe, expect, it } from 'vitest'
import { DEFAULT_OWNER_SETTINGS } from './defaultOwnerSettings'
import { validateOwnerSettings } from './settingsValidation'

const cloneSettings = () => structuredClone(DEFAULT_OWNER_SETTINGS)

describe('validateOwnerSettings', () => {
  it('accepts the default saved settings', () => {
    expect(validateOwnerSettings(cloneSettings())).toEqual({})
  })

  it('rejects required fields, duplicate codes, and zero active branches', () => {
    const settings = cloneSettings()
    settings.storeProfile.storeName = ' '
    settings.branches[0].code = 'same'
    settings.branches[1].code = ' SAME '
    settings.branches.forEach((branch) => { branch.isActive = false })

    const errors = validateOwnerSettings(settings)
    expect(errors.storeName).toBeDefined()
    expect(errors['branch.1.code']).toMatch(/unique/i)
    expect(errors.branches).toMatch(/one branch/i)
  })

  it('protects the owner role and Settings access invariants', () => {
    const settings = cloneSettings()
    settings.staffRoles.roles = ['admin', 'florist']
    settings.staffRoles.defaultRole = 'finance'
    settings.permissions.owner.settings = 'none'
    settings.permissions.admin.settings = 'edit'

    const errors = validateOwnerSettings(settings)
    expect(errors.ownerRole).toBeDefined()
    expect(errors.defaultRole).toBeDefined()
    expect(errors.ownerSettings).toBeDefined()
    expect(errors.nonOwnerSettings).toBeDefined()
  })
})

it('returns field-level payment-method errors', () => {
  const settings = cloneSettings()
  settings.paymentMethods.bankAccounts[0] = {
    ...settings.paymentMethods.bankAccounts[0],
    bankName: '',
    accountNumber: '',
    accountHolder: '',
  }
  settings.paymentMethods.paymentInstructions = ''

  const errors = validateOwnerSettings(settings)
  expect(errors['paymentMethods.bankAccounts.0.bankName']).toMatch(/required/i)
  expect(errors['paymentMethods.bankAccounts.0.accountNumber']).toMatch(/required/i)
  expect(errors['paymentMethods.bankAccounts.0.accountHolder']).toMatch(/required/i)
  expect(errors['paymentMethods.paymentInstructions']).toMatch(/required/i)
})

import { validateOwnerSettingsSection } from './settingsValidation'

describe('validateOwnerSettingsSection', () => {
  it('returns only errors belonging to the active section', () => {
    const settings = cloneSettings()
    settings.storeProfile.storeName = ''
    settings.paymentMethods.paymentInstructions = ''

    expect(validateOwnerSettingsSection(settings, 'store-profile')).toEqual({
      storeName: 'Store name is required.',
    })
    expect(validateOwnerSettingsSection(settings, 'payment-methods')).toHaveProperty(
      'paymentMethods.paymentInstructions',
    )
  })
})
