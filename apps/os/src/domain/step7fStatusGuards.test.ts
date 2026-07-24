import { beforeEach, expect, it } from 'vitest'
import { canRecordAttendance, canSetEmployeeActiveState } from './hrStatusDomain'
import { canSetCatalogVariantStatus } from './catalogVariantStatusDomain'
import { useHrStore } from '../store/hrStore'
import { useCatalogStore } from '../store/catalogStore'
import type { Employee } from '../store/hrStoreTypes'
import type { CatalogProduct } from '../store/catalogStoreTypes'

const owner: Employee = { id: 'owner', name: 'Owner', position: 'Owner', branch: 'Kedamaian', systemRole: 'owner', status: 'active', phone: '', hireDate: '2024-01-01' }
const staff: Employee = { id: 'staff', name: 'Staff', position: 'Florist', branch: 'Kedamaian', systemRole: 'florist', status: 'active', phone: '', hireDate: '2024-01-01' }
const hr = { name: 'HR', role: 'hr' as const }
const product: CatalogProduct = { id: 'p1', productId: 'BOQ-1', category: 'Bouquet', material: 'fresh', name: 'Rose', isActive: true, variants: [{ id: 'v1', sku: 'SKU-1', size: 'M', price: 100, status: 'active' }] }

beforeEach(() => {
  useHrStore.setState({ employees: [owner, staff], attendance: [] })
  useCatalogStore.setState({ products: [product], categories: [{ id: 'c1', name: 'Bouquet', prefix: 'BOQ' }], deletedProductIds: [] })
})

it('protects the last active owner and unauthorized HR writers', () => {
  expect(canSetEmployeeActiveState({ employees: [owner, staff], employeeId: 'owner', active: false, actor: hr }).ok).toBe(false)
  expect(canRecordAttendance({ employee: staff, date: '2026-07-10', status: 'present', actor: { name: 'Admin', role: 'admin' } }).ok).toBe(false)
})
it('uses explicit employee status commands and blocks inactive attendance', () => {
  expect(useHrStore.getState().deactivateEmployee('staff', hr)).toBe(true)
  expect(useHrStore.getState().recordAttendance({ employeeId: 'staff', date: '2026-07-10', status: 'present', actor: hr })).toBe(false)
  expect(useHrStore.getState().activateEmployee('staff', hr)).toBe(true)
  expect(useHrStore.getState().recordAttendance({ employeeId: 'staff', date: '2026-07-10', status: 'present', actor: hr })).toBe(true)
})
it('blocks broad product patches from changing existing variant status', () => {
  useCatalogStore.getState().updateProduct('p1', { variants: [{ ...product.variants[0], status: 'inactive' }] })
  expect(useCatalogStore.getState().products[0].variants[0].status).toBe('active')
})
it('changes existing variant status only through the guarded command', () => {
  expect(canSetCatalogVariantStatus({ products: [product], productId: 'p1', variantId: 'v1', status: 'inactive', role: 'florist' }).ok).toBe(false)
  expect(useCatalogStore.getState().setCatalogVariantStatus({ productId: 'p1', variantId: 'v1', status: 'inactive', role: 'admin' })).toBe(true)
  expect(useCatalogStore.getState().products[0].variants[0].status).toBe('inactive')
})
