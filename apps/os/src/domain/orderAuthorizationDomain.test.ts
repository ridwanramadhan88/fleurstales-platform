import { describe, expect, it } from 'vitest'
import { DEFAULT_ROLE_SECTION_ACCESS } from '../config/permissions'
import { makeOrder } from '../test/factories/order'
import { authorizeOrderMutation, canViewOrder } from './orderAuthorizationDomain'

describe('order row-level authorization', () => {
  const kedamaianOrder = makeOrder({ orderNumber:'KDM-1', branch:'Kedamaian', floristAssignedEmployeeId:'florist-a', adminHandledEmployeeId:'admin-a' })

  it('keeps Owner, Admin, Finance, and HR reads company-wide', () => {
    expect(canViewOrder(kedamaianOrder,{ employeeId:'admin-b',name:'Admin B',role:'admin',branchId:'Pahoman' },DEFAULT_ROLE_SECTION_ACCESS)).toBe(true)
    expect(canViewOrder(kedamaianOrder,{ employeeId:'admin-off-shift',name:'Admin Off Shift',role:'admin' },DEFAULT_ROLE_SECTION_ACCESS)).toBe(true)
    expect(canViewOrder(kedamaianOrder,{ employeeId:'owner-a',name:'Owner',role:'owner',branchId:'Pahoman' },DEFAULT_ROLE_SECTION_ACCESS)).toBe(true)
    expect(canViewOrder(kedamaianOrder,{ employeeId:'finance-a',name:'Finance',role:'finance' },DEFAULT_ROLE_SECTION_ACCESS)).toBe(true)
    expect(canViewOrder(kedamaianOrder,{ employeeId:'hr-a',name:'HR',role:'hr',branchId:'Pahoman' },DEFAULT_ROLE_SECTION_ACCESS)).toBe(true)
  })

  it('keeps Admin operational mutations branch-scoped even though reads are company-wide', () => {
    const crossBranchAdmin={ employeeId:'admin-b',name:'Admin B',role:'admin' as const,branchId:'Pahoman' }
    expect(canViewOrder(kedamaianOrder,crossBranchAdmin,DEFAULT_ROLE_SECTION_ACCESS)).toBe(true)
    expect(authorizeOrderMutation({ order:kedamaianOrder, actor:crossBranchAdmin, permissions:DEFAULT_ROLE_SECTION_ACCESS, kind:'details' })).toMatchObject({ allowed:false })
    expect(authorizeOrderMutation({ order:kedamaianOrder, actor:crossBranchAdmin, permissions:DEFAULT_ROLE_SECTION_ACCESS, kind:'status' })).toMatchObject({ allowed:false })
  })

  it('lets an Admin without an active branch read company-wide but blocks operations', () => {
    const offShiftAdmin={ employeeId:'admin-off-shift',name:'Admin Off Shift',role:'admin' as const }
    expect(canViewOrder(kedamaianOrder,offShiftAdmin,DEFAULT_ROLE_SECTION_ACCESS)).toBe(true)
    expect(authorizeOrderMutation({ order:kedamaianOrder, actor:offShiftAdmin, permissions:DEFAULT_ROLE_SECTION_ACCESS, kind:'status' })).toMatchObject({ allowed:false })
  })

  it('limits Florists to orders assigned to their employee identity without branch filtering', () => {
    expect(canViewOrder(kedamaianOrder,{ employeeId:'florist-a',name:'Florist A',role:'florist',branchId:'Kedamaian' },DEFAULT_ROLE_SECTION_ACCESS)).toBe(true)
    expect(canViewOrder(kedamaianOrder,{ employeeId:'florist-a',name:'Florist A Cross Branch',role:'florist',branchId:'Pahoman' },DEFAULT_ROLE_SECTION_ACCESS)).toBe(true)
    expect(canViewOrder(kedamaianOrder,{ employeeId:'florist-b',name:'Florist B',role:'florist',branchId:'Kedamaian' },DEFAULT_ROLE_SECTION_ACCESS)).toBe(false)
    expect(canViewOrder(makeOrder({ orderNumber:'KDM-U',branch:'Kedamaian',floristAssignedEmployeeId:undefined }),{ name:'No Staff Identity',role:'florist' },DEFAULT_ROLE_SECTION_ACCESS)).toBe(false)
  })

  it('keeps assigned Florists read-only for Order status', () => {
    expect(authorizeOrderMutation({ order:kedamaianOrder, actor:{ employeeId:'florist-a',name:'Florist A',role:'florist',branchId:'Kedamaian' }, permissions:DEFAULT_ROLE_SECTION_ACCESS, kind:'status', nextStatus:'processing' })).toMatchObject({ allowed:false })
  })

  it('keeps Finance read-only for direct locked-order mutations', () => {
    const locked=makeOrder({ orderNumber:'KDM-FIN-LOCK',branch:'Kedamaian',status:'delivered' })
    const finance={ employeeId:'finance-a',name:'Finance',role:'finance' as const }
    for (const kind of ['details','payment','status'] as const) {
      expect(authorizeOrderMutation({ order:locked,actor:finance,permissions:DEFAULT_ROLE_SECTION_ACCESS,kind })).toMatchObject({ allowed:false })
    }
  })
})
