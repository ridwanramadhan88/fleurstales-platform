import { describe, expect, it } from 'vitest'
import {
  buildEmployeePointSummaries,
  DEFAULT_ORDER_CONTRIBUTION_RULES,
  validateOrderContributionRules,
} from './orderContributionPointsDomain'
import type { Employee, EmployeePointEntry } from '../store/hrStoreTypes'
import type { OrderTableRow } from '../types/orders'

const employees: Employee[] = [
  { id:'f1', name:'Florist', position:'Florist', branch:'b1', systemRole:'florist', status:'active', phone:'', hireDate:'2020-01-01' },
]
const order = (index:number): OrderTableRow => ({
  orderNumber:`ORD-${index}`, customerName:'C', source:'walk_in', fulfillment:'pickup', status:'picked_up', totalIdr:200_000, branch:'b1', paymentStatus:'paid', createdAtLabel:'x', financeVerified:true, completedAt:`2026-07-${String(index).padStart(2,'0')}T10:00:00.000Z`, floristAssignedEmployeeId:'f1',
})

describe('HR point rules and summaries',()=>{
  it('validates whole-number thresholds and positive point values',()=>{
    expect(validateOrderContributionRules(DEFAULT_ORDER_CONTRIBUTION_RULES)).toEqual({ok:true})
    expect(validateOrderContributionRules({...DEFAULT_ORDER_CONTRIBUTION_RULES,collectOrderPoints:0})).toMatchObject({ok:false,field:'collectOrderPoints'})
  })
  it('builds employee progress and estimated bonus from approved entries',()=>{
    const entries:EmployeePointEntry[]=[{id:'p1',employeeId:'f1',category:'florist_assignment',points:10,sourceType:'order',sourceId:'order:ORD-3:florist_assignment',periodKey:'2026-07',reason:'x',status:'approved',createdBy:'HR',createdAt:'2026-07-03'}]
    const [summary]=buildEmployeePointSummaries({orders:[order(1),order(2),order(3)],employees,entries,rules:DEFAULT_ORDER_CONTRIBUTION_RULES,periodKey:'2026-07'})
    expect(summary).toMatchObject({approvedNetPoints:10,estimatedBonusIdr:10000})
  })
})
