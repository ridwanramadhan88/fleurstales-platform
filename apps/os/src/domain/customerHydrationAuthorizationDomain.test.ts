import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_ACTION_PERMISSIONS } from '../config/actionPermissions'
import { DEFAULT_ROLE_SECTION_ACCESS } from '../config/permissions'
import {
  canHydrateBusinessOsCustomers,
  hydrateBusinessOsCustomersIfAuthorized,
} from './customerHydrationAuthorizationDomain'

const authorizationFor = (role: 'owner' | 'admin' | 'finance' | 'hr' | 'florist') => ({
  role,
  permissions: structuredClone(DEFAULT_ROLE_SECTION_ACCESS),
  actionPermissions: structuredClone(DEFAULT_ACTION_PERMISSIONS),
})

describe('customer hydration authorization', () => {
  it('skips customer hydration for HR without customer or order-create authority', async () => {
    const authorization = authorizationFor('hr')
    const hydrate = vi.fn(async () => false)

    expect(canHydrateBusinessOsCustomers(authorization)).toBe(false)
    await expect(hydrateBusinessOsCustomersIfAuthorized(authorization, hydrate)).resolves.toBe(true)
    expect(hydrate).not.toHaveBeenCalled()
  })

  it('hydrates customers for roles with customer workspace access', async () => {
    const authorization = authorizationFor('finance')
    const hydrate = vi.fn(async () => true)

    expect(canHydrateBusinessOsCustomers(authorization)).toBe(true)
    await expect(hydrateBusinessOsCustomersIfAuthorized(authorization, hydrate)).resolves.toBe(true)
    expect(hydrate).toHaveBeenCalledTimes(1)
  })

  it('also permits hydration through the order-create capability', () => {
    const authorization = authorizationFor('admin')
    authorization.permissions.admin.customers = 'none'

    expect(canHydrateBusinessOsCustomers(authorization)).toBe(true)
  })

  it('preserves a genuine customer hydration failure for an authorized session', async () => {
    const authorization = authorizationFor('admin')
    const hydrate = vi.fn(async () => false)

    await expect(hydrateBusinessOsCustomersIfAuthorized(authorization, hydrate)).resolves.toBe(false)
    expect(hydrate).toHaveBeenCalledTimes(1)
  })
})
