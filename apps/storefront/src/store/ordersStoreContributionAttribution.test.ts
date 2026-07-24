import { beforeEach, describe, expect, it } from 'vitest'
import { useOrdersStore } from './ordersStore'
import { useUserStore } from './userStore'
import { useHrStore } from './hrStore'
import { useSettingsStore } from './settingsStore'
import { DEFAULT_OWNER_SETTINGS } from '../domain/settings/defaultOwnerSettings'

const initialUser=useUserStore.getState()
const initialEmployees=useHrStore.getState().employees

beforeEach(()=>{
 useOrdersStore.setState({orders:[],lastSequence:{Kedamaian:0}})
 useUserStore.setState({...initialUser,employeeId:'emp-akbar',name:'Akbar',username:'akbar',role:'admin',branchId:'Kedamaian'})
 useSettingsStore.setState({ ...structuredClone(DEFAULT_OWNER_SETTINGS), settingsHasUnsavedChanges:false })
 useHrStore.setState({
  employees:initialEmployees,
  employeeDefaultSchedules:[],
  scheduleOverrides:[{
   id:'schedule-vero-2026-07-13', employeeId:'emp-vero', date:'2026-07-13',
   shift:{mode:'custom',isWorking:true,branchId:'Kedamaian',startTime:'07:00',endTime:'16:00'},
   updatedAt:'2026-07-12T00:00:00.000Z', updatedBy:'HR',
  }, {
   id:'schedule-zizi-2026-07-13', employeeId:'emp-zizi', date:'2026-07-13',
   shift:{mode:'custom',isWorking:true,branchId:'Kedamaian',startTime:'07:00',endTime:'16:00'},
   updatedAt:'2026-07-12T00:00:00.000Z', updatedBy:'HR',
  }],
  weeklySchedulePublications:[{
   id:'pub-2026-07-13',weekStart:'2026-07-13',branchId:'All',status:'published',
   publishedAt:'2026-07-12T00:00:00.000Z',publishedBy:'HR',updatedAt:'2026-07-12T00:00:00.000Z',
  }],
 })
})

describe('order contribution attribution',()=>{
 it('stores the exact Admin employee id on internal order creation',()=>{
  const created=useOrdersStore.getState().createOrder({branch:'Kedamaian',customerName:'C',orderType:'admin_created',fulfillmentType:'pickup',depositAmount:0,notes:null,totalIdr:1000})
  expect(created.adminHandledEmployeeId).toBe('emp-akbar')
 })
 it('stores stable florist and admin attribution when Processing starts',()=>{
  const created=useOrdersStore.getState().createOrder({branch:'Kedamaian',customerName:'C',orderType:'admin_created',fulfillmentType:'pickup',depositAmount:0,notes:null,totalIdr:1000,scheduleDate:'2026-07-13',scheduleTime:'10:00'})
  useOrdersStore.getState().updateOrderStatus({ orderNumber:created.orderNumber, expectedRevision:created.revision ?? 1, status:'confirmed', actor:{ employeeId:'emp-akbar', name:'Akbar', role:'admin', branchId:'Kedamaian' }, source:'workflow' })
  const confirmed=useOrdersStore.getState().orders[0]
  const result=useOrdersStore.getState().assignFloristAndStartProcessing({ orderNumber:confirmed.orderNumber, expectedRevision:confirmed.revision ?? 1, floristEmployeeId:'emp-vero', actor:{ employeeId:'emp-akbar', name:'Akbar', role:'admin', branchId:'Kedamaian' } })
  expect(result.allowed).toBe(true)
  expect(useOrdersStore.getState().orders[0]).toMatchObject({status:'processing',florist:'Vero',floristAssignedEmployeeId:'emp-vero',floristAssignedForDate:'2026-07-13',floristAssignedForTime:'10:00',adminHandledEmployeeId:'emp-akbar'})
 })

 it('requires explicit confirmation before assigning outside the live schedule',()=>{
  const created=useOrdersStore.getState().createOrder({branch:'Kedamaian',customerName:'C',orderType:'admin_created',fulfillmentType:'pickup',depositAmount:0,notes:null,totalIdr:1000,scheduleDate:'2026-07-13',scheduleTime:'18:00'})
  useOrdersStore.getState().updateOrderStatus({ orderNumber:created.orderNumber, expectedRevision:created.revision ?? 1, status:'confirmed', actor:{ employeeId:'emp-akbar', name:'Akbar', role:'admin', branchId:'Kedamaian' }, source:'workflow' })
  const confirmed=useOrdersStore.getState().orders[0]
  const denied=useOrdersStore.getState().assignFloristAndStartProcessing({ orderNumber:confirmed.orderNumber, expectedRevision:confirmed.revision ?? 1, floristEmployeeId:'emp-vero', actor:{ employeeId:'emp-akbar', name:'Akbar', role:'admin', branchId:'Kedamaian' } })
  expect(denied.allowed).toBe(false)
  expect(useOrdersStore.getState().orders[0].status).toBe('confirmed')
  const allowed=useOrdersStore.getState().assignFloristAndStartProcessing({ orderNumber:confirmed.orderNumber, expectedRevision:confirmed.revision ?? 1, floristEmployeeId:'emp-vero', allowScheduleOverride:true, actor:{ employeeId:'emp-akbar', name:'Akbar', role:'admin', branchId:'Kedamaian' } })
  expect(allowed.allowed).toBe(true)
  expect(useOrdersStore.getState().orders[0]).toMatchObject({
    status:'processing',
    floristScheduleOverride:true,
    floristScheduleOverrideReason:'Shift 07:00-16:00 does not cover the order time.',
    floristScheduledBranchId:'Kedamaian',
    floristAssignedBranchId:'Kedamaian',
  })
 })
 it('reassigns an active processing order without changing its status or admin attribution',()=>{
  const created=useOrdersStore.getState().createOrder({branch:'Kedamaian',customerName:'C',orderType:'admin_created',fulfillmentType:'pickup',depositAmount:0,notes:null,totalIdr:1000,scheduleDate:'2026-07-13',scheduleTime:'10:00'})
  const actor={ employeeId:'emp-akbar', name:'Akbar', role:'admin' as const, branchId:'Kedamaian' as const }
  useOrdersStore.getState().updateOrderStatus({ orderNumber:created.orderNumber, expectedRevision:created.revision ?? 1, status:'confirmed', actor, source:'workflow' })
  const confirmed=useOrdersStore.getState().orders[0]
  const assigned=useOrdersStore.getState().assignFloristAndStartProcessing({ orderNumber:confirmed.orderNumber, expectedRevision:confirmed.revision ?? 1, floristEmployeeId:'emp-vero', actor })
  expect(assigned.allowed).toBe(true)
  if(!assigned.allowed)return
  const reassigned=useOrdersStore.getState().reassignFlorist({ orderNumber:assigned.order.orderNumber, expectedRevision:assigned.order.revision ?? 1, floristEmployeeId:'emp-zizi', actor })
  expect(reassigned.allowed).toBe(true)
  if(!reassigned.allowed)return
  expect(reassigned.order).toMatchObject({ status:'processing', florist:'Zizi', floristAssignedEmployeeId:'emp-zizi', adminHandledEmployeeId:'emp-akbar' })
 })

 it('rejects same-florist, stale-revision, unauthorized, and closed-order reassignment',()=>{
  const actor={ employeeId:'emp-akbar', name:'Akbar', role:'admin' as const, branchId:'Kedamaian' as const }
  const created=useOrdersStore.getState().createOrder({branch:'Kedamaian',customerName:'C',orderType:'admin_created',fulfillmentType:'pickup',depositAmount:0,notes:null,totalIdr:1000,scheduleDate:'2026-07-13',scheduleTime:'10:00'})
  useOrdersStore.getState().updateOrderStatus({ orderNumber:created.orderNumber, expectedRevision:created.revision ?? 1, status:'confirmed', actor, source:'workflow' })
  const confirmed=useOrdersStore.getState().orders[0]
  const assigned=useOrdersStore.getState().assignFloristAndStartProcessing({ orderNumber:confirmed.orderNumber, expectedRevision:confirmed.revision ?? 1, floristEmployeeId:'emp-vero', actor })
  expect(assigned.allowed).toBe(true)
  if(!assigned.allowed)return
  expect(useOrdersStore.getState().reassignFlorist({ orderNumber:assigned.order.orderNumber, expectedRevision:assigned.order.revision ?? 1, floristEmployeeId:'emp-vero', actor })).toMatchObject({ allowed:false, code:'NO_CHANGE' })
  expect(useOrdersStore.getState().reassignFlorist({ orderNumber:assigned.order.orderNumber, expectedRevision:1, floristEmployeeId:'emp-zizi', actor })).toMatchObject({ allowed:false, code:'REVISION_CONFLICT' })
  expect(useOrdersStore.getState().reassignFlorist({ orderNumber:assigned.order.orderNumber, expectedRevision:assigned.order.revision ?? 1, floristEmployeeId:'emp-zizi', actor:{employeeId:'emp-vero',name:'Vero',role:'florist',branchId:'Kedamaian'} })).toMatchObject({ allowed:false, code:'NOT_PERMITTED' })
  useOrdersStore.setState({orders:[{...assigned.order,status:'picked_up'}]})
  expect(useOrdersStore.getState().reassignFlorist({ orderNumber:assigned.order.orderNumber, expectedRevision:assigned.order.revision ?? 1, floristEmployeeId:'emp-zizi', actor })).toMatchObject({ allowed:false, code:'NOT_PERMITTED' })
 })

})
