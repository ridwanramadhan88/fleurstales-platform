import { describe, expect, it } from 'vitest'
import { buildExpectedOrderContributions } from './orderContributionPointsDomain'
import type { OrderTableRow } from '../types/orders'
import type { Employee } from '../store/hrStoreTypes'

const employees=[
  {id:'a1',name:'A',position:'Admin',branch:'Kedamaian',systemRole:'admin',status:'active',phone:'2',hireDate:'2026-01-01'},
  {id:'f1',name:'F',position:'Florist',branch:'Kedamaian',systemRole:'florist',status:'active',phone:'3',hireDate:'2026-01-01'},
] as Employee[]
const order=(totalIdr:number,items?:OrderTableRow['items']):OrderTableRow=>({orderNumber:`ORD-${totalIdr}`,customerName:'C',source:'walk_in',fulfillment:'pickup',status:'picked_up',totalIdr,items,branch:'Kedamaian',paymentStatus:'paid',createdAtLabel:'x',financeVerified:true,financeVerifiedAt:'2026-07-10T00:00:00Z',completedAt:'2026-07-10T00:00:00Z',adminHandledEmployeeId:'a1'})

describe('collect-order points',()=>{
  it('awards the handling Admin once when verified product subtotal is at least Rp200.000',()=>{
    const contributions=buildExpectedOrderContributions({orders:[order(199_999),order(200_000)],employees,rules:{collectOrderMinimumProductSubtotalIdr:200_000,collectOrderPoints:1,orderContributionActiveFrom:'2026-01-01T00:00:00Z'}})
    expect(contributions).toHaveLength(1)
    expect(contributions).toEqual([expect.objectContaining({category:'admin_order_handled',points:1})])
  })


  it('awards both the handling Admin and assigned Florist for the same qualifying order',()=>{
    const candidate={...order(250_000),floristAssignedEmployeeId:'f1'}
    const contributions=buildExpectedOrderContributions({orders:[candidate],employees,rules:{collectOrderMinimumProductSubtotalIdr:200_000,collectOrderPoints:1,orderContributionActiveFrom:'2026-01-01T00:00:00Z'}})
    expect(contributions).toHaveLength(2)
    expect(contributions.map(item=>[item.employeeId,item.category,item.points])).toEqual([
      ['a1','admin_order_handled',1],
      ['f1','florist_order_completed',1],
    ])
  })

  it('does not backfill orders completed before the activation timestamp',()=>{
    expect(buildExpectedOrderContributions({
      orders:[order(300_000)],
      employees,
      rules:{
        collectOrderMinimumProductSubtotalIdr:200_000,
        collectOrderPoints:1,
        orderContributionActiveFrom:'2026-07-11T00:00:00Z',
      },
    })).toHaveLength(0)
  })
  it('uses line-item subtotal instead of delivery-inclusive total when items exist',()=>{
    const candidate=order(250_000,[{id:'1',productName:'Bouquet',quantity:1,unitPriceIdr:190_000}])
    expect(buildExpectedOrderContributions({orders:[candidate],employees,rules:{collectOrderMinimumProductSubtotalIdr:200_000,collectOrderPoints:1,orderContributionActiveFrom:'2026-01-01T00:00:00Z'}})).toHaveLength(0)
  })
})
