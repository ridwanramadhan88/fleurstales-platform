import { beforeEach, describe, expect, it } from 'vitest'
import { useHrStore } from './hrStore'
import type { OrderTableRow } from '../types/orders'
import { DEFAULT_ORDER_CONTRIBUTION_RULES } from '../domain/orderContributionPointsDomain'

const initial = useHrStore.getState()
const finance = { name:'Finance User', role:'finance' as const }
const makeOrder=(overrides:Partial<OrderTableRow>={}):OrderTableRow=>({
  orderNumber:'KDM-2026-0001', customerName:'C', source:'walk_in', fulfillment:'pickup',
  status:'picked_up', totalIdr:200_000, branch:'Kedamaian', paymentStatus:'paid',
  createdAtLabel:'x', financeVerified:true, financeVerifiedAt:'2026-08-10T10:00:00.000Z', completedAt:'2026-08-10T10:00:00.000Z',
  adminHandledEmployeeId:'emp-akbar', ...overrides,
})

beforeEach(()=>useHrStore.setState({...initial,employeePointEntries:[],pointRules:{...DEFAULT_ORDER_CONTRIBUTION_RULES}}))

describe('collect-order point synchronization',()=>{
  it('creates one automatically approved point for the handling Admin without duplicates',()=>{
    const order=makeOrder()
    expect(useHrStore.getState().syncOrderContributionPoints({orders:[order],actor:finance})).toMatchObject({ok:true,created:1})
    const entries=useHrStore.getState().employeePointEntries
    expect(entries).toHaveLength(1)
    expect(entries.map(entry=>entry.category).sort()).toEqual(['admin_order_handled'])
    expect(entries.every(entry=>entry.points===1&&entry.status==='approved'&&entry.sourceType==='order')).toBe(true)
    expect(useHrStore.getState().syncOrderContributionPoints({orders:[order],actor:finance})).toMatchObject({ok:true,created:0})
    expect(useHrStore.getState().employeePointEntries).toHaveLength(1)
  })


  it('creates approved points for both the handling Admin and assigned Florist',()=>{
    const order=makeOrder({floristAssignedEmployeeId:'emp-vero'})
    expect(useHrStore.getState().syncOrderContributionPoints({orders:[order],actor:finance})).toMatchObject({ok:true,created:2})
    expect(useHrStore.getState().employeePointEntries.map(entry=>[entry.employeeId,entry.category,entry.points]).sort()).toEqual([
      ['emp-akbar','admin_order_handled',1],
      ['emp-vero','florist_order_completed',1],
    ])
  })

  it('does not reward orders below Rp200.000 and reverses approved rewards after a refund',()=>{
    expect(useHrStore.getState().syncOrderContributionPoints({orders:[makeOrder({totalIdr:199_999})],actor:finance})).toMatchObject({ok:true,created:0})
    const order=makeOrder()
    useHrStore.getState().syncOrderContributionPoints({orders:[order],actor:finance})
    useHrStore.getState().syncOrderContributionPoints({orders:[{...order,paymentStatus:'refunded'}],actor:finance})
    const entries=useHrStore.getState().employeePointEntries
    expect(entries.filter(entry=>entry.category==='reversal')).toHaveLength(1)
    expect(entries.filter(entry=>entry.status==='reversed')).toHaveLength(1)
  })
})
