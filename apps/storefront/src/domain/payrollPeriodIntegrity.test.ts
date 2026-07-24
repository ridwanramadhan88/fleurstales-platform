import { describe, expect, it } from 'vitest'
import { buildExpectedOrderContributions } from './orderContributionPointsDomain'
import { getPayrollPeriodIdForActivityDate } from './payrollScheduleDomain'
import type { OrderTableRow } from '../types/orders'

const payroll = { frequency:'monthly' as const, periodStartDay:21, periodEndDay:20, hrSubmissionDay:24, financeReviewDay:27, paymentDay:28, timezone:'Asia/Jakarta' as const, pointValueIdr:1000 as const }
const employee:any={id:'a1',name:'Admin',position:'Admin',branch:'b1',systemRole:'admin',status:'active',phone:'',hireDate:'2026-01-01'}
const order=(number:string,date:string):OrderTableRow=>({orderNumber:number,customerName:'C',source:'walk_in',fulfillment:'pickup',status:'picked_up',totalIdr:200_000,branch:'b1',paymentStatus:'paid',createdAtLabel:'x',financeVerified:true,completedAt:`${date}T10:00:00.000Z`,adminHandledEmployeeId:'a1'})

describe('payroll-period point integrity',()=>{
  it('maps activity dates to the 21st–20th generated payroll period',()=>{
    expect(getPayrollPeriodIdForActivityDate('2026-07-20',payroll)).toBe('payroll-2026-07')
    expect(getPayrollPeriodIdForActivityDate('2026-07-21',payroll)).toBe('payroll-2026-08')
    expect(getPayrollPeriodIdForActivityDate('2026-08-20',payroll)).toBe('payroll-2026-08')
  })
  it('groups collect-order rewards across a cross-month payroll period',()=>{
    const orders=[...Array.from({length:20},(_,i)=>order(`J-${i}`,'2026-07-25')),...Array.from({length:2},(_,i)=>order(`A-${i}`,'2026-08-05'))]
    const result=buildExpectedOrderContributions({orders,employees:[employee],rules:{collectOrderMinimumProductSubtotalIdr:200_000,collectOrderPoints:1},payrollSettings:payroll})
    expect(result).toHaveLength(22)
    expect(result.every(item=>item.payrollPeriodId==='payroll-2026-08')).toBe(true)
    expect(result[0].ordinal).toBe(1)
    expect(result.at(-1)?.ordinal).toBe(22)
  })
})
