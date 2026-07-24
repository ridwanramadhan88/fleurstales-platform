import { describe, expect, it } from 'vitest'
import { getFloristAssignmentOptionsForOrder, resolveFloristAssignmentMoment } from './floristAssignmentDomain'
import type { Employee, ScheduleOverride } from '../store/hrStoreTypes'
import type { OrderTableRow } from '../types/orders'
import { DEFAULT_OWNER_SETTINGS } from './settings/defaultOwnerSettings'

const florist = (id:string, name:string):Employee => ({ id, name, position:'Florist', branch:'', systemRole:'florist', status:'active', phone:'', hireDate:'2026-01-01' })
const order = { orderNumber:'KDM-1', branch:'Kedamaian', scheduleDate:'2026-07-16', scheduleTime:'14:00', status:'confirmed' } as OrderTableRow
const shifts:ScheduleOverride[] = [
  { id:'s1', employeeId:'f1', date:'2026-07-16', shift:{ mode:'custom', isWorking:true, branchId:'Kedamaian', startTime:'09:00', endTime:'17:00' }, updatedAt:'', updatedBy:'HR' },
  { id:'s2', employeeId:'f2', date:'2026-07-16', shift:{ mode:'custom', isWorking:true, branchId:'Pahoman', startTime:'09:00', endTime:'17:00' }, updatedAt:'', updatedBy:'HR' },
  { id:'s3', employeeId:'f3', date:'2026-07-16', shift:{ mode:'off', isWorking:false, branchId:'', startTime:'', endTime:'' }, updatedAt:'', updatedBy:'HR' },
]

describe('florist assignment availability', () => {
  it('uses the future order date and time instead of the processing time', () => {
    expect(resolveFloristAssignmentMoment(order, new Date('2026-07-15T03:00:00+07:00'))).toEqual({ date:'2026-07-16', time:'14:00', source:'scheduled' })
  })

  it('returns only active florists whose branch shift covers the order time', () => {
    const result = getFloristAssignmentOptionsForOrder({
      order,
      employees:[florist('f1','A'), florist('f2','B'), florist('f3','C')],
      defaults:[], overrides:shifts,
      settings:{ scheduling:DEFAULT_OWNER_SETTINGS.scheduling, branches:DEFAULT_OWNER_SETTINGS.branches },
      orders:[],
    })
    expect(result.filter((item)=>item.isRecommended).map((item)=>item.employeeId)).toEqual(['f1'])
  })


  it('keeps every active florist available for an explicit override with a clear status', () => {
    const result = getFloristAssignmentOptionsForOrder({
      order,
      employees:[florist('f1','A'), florist('f2','B'), florist('f3','C'), florist('f4','D')],
      defaults:[],
      overrides:[...shifts, { id:'s4', employeeId:'f4', date:'2026-07-16', shift:{ mode:'custom', isWorking:true, branchId:'Kedamaian', startTime:'15:00', endTime:'20:00' }, updatedAt:'', updatedBy:'HR' }],
      settings:{ scheduling:DEFAULT_OWNER_SETTINGS.scheduling, branches:DEFAULT_OWNER_SETTINGS.branches },
      orders:[],
    })
    expect(result.map((item)=>[item.employeeId,item.scheduleStatus])).toEqual([
      ['f1','scheduled'],
      ['f2','different_branch'],
      ['f4','outside_shift'],
      ['f3','off'],
    ])
  })

  it('sorts lower current workload first', () => {
    const sameBranch = [...shifts, { ...shifts[0], id:'s4', employeeId:'f4' }]
    const active = [{ ...order, orderNumber:'KDM-2', status:'processing', floristAssignedEmployeeId:'f1' } as OrderTableRow]
    const result = getFloristAssignmentOptionsForOrder({ order, employees:[florist('f1','A'),florist('f4','D')], defaults:[], overrides:sameBranch, settings:{ scheduling:DEFAULT_OWNER_SETTINGS.scheduling, branches:DEFAULT_OWNER_SETTINGS.branches }, orders:active })
    expect(result.filter((item)=>item.isRecommended).map((item)=>item.employeeId)).toEqual(['f4','f1'])
  })
})
