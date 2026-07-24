import { beforeEach, describe, expect, it } from 'vitest'
import { useHrStore } from './hrStore'
import { DEFAULT_ORDER_CONTRIBUTION_RULES } from '../domain/orderContributionPointsDomain'

const initial=useHrStore.getState()
const hr={name:'HR User',role:'hr' as const}
beforeEach(()=>useHrStore.setState({...initial,employeePointEntries:[],pointRules:{...DEFAULT_ORDER_CONTRIBUTION_RULES}}))

describe('HR point rules store',()=>{
  it('saves collect-order rules and rejects invalid point values',()=>{
    expect(useHrStore.getState().updatePointRules({rules:{...DEFAULT_ORDER_CONTRIBUTION_RULES,collectOrderMinimumProductSubtotalIdr:250_000},actor:hr})).toEqual({ok:true})
    expect(useHrStore.getState().pointRules.collectOrderMinimumProductSubtotalIdr).toBe(250_000)
    expect(useHrStore.getState().updatePointRules({rules:{...DEFAULT_ORDER_CONTRIBUTION_RULES,collectOrderPoints:0},actor:hr})).toMatchObject({ok:false,field:'collectOrderPoints'})
  })
  it('keeps attendance minus-point cap validation',()=>{
    useHrStore.setState({pointRules:{...DEFAULT_ORDER_CONTRIBUTION_RULES,maximumMinusPointsPerPeriod:10},employeePointEntries:[
      {id:'approved-minus',employeeId:'emp-staff',category:'manual_penalty',points:-8,sourceType:'manual',sourceId:'m1',periodKey:'2026-07',reason:'x',status:'approved',createdBy:'HR',createdAt:'2026-07-01'},
      {id:'pending-minus',employeeId:'emp-staff',category:'manual_penalty',points:-5,sourceType:'manual',sourceId:'m2',periodKey:'2026-07',reason:'y',status:'pending',createdBy:'HR',createdAt:'2026-07-02'},
    ]})
    expect(useHrStore.getState().approvePointEntry({entryId:'pending-minus',note:'reviewed',actor:hr})).toMatchObject({ok:false})
  })
})
