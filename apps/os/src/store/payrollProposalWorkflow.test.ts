import { beforeEach, describe, expect, it } from 'vitest'
import { usePayrollStore, type EmployeePayrollDraft } from './payrollStore'

const hr={name:'Star',role:'hr' as const}
const finance={name:'Dewi',role:'finance' as const}
const draft:EmployeePayrollDraft={id:'draft-1',payrollPeriodId:'period-1',employeeId:'emp-staff',employeeName:'Rina',employeeRole:'florist',baseSalaryIdr:4_000_000,positivePoints:20,negativePoints:0,netPoints:20,bonusIdr:20_000,finalPayrollIdr:4_020_000,pointEntries:[{id:'p1',category:'manual_reward',points:20,reason:'Reward',sourceType:'manual',sourceId:'manual-1',createdAt:'2026-08-10T00:00:00Z'}],status:'draft',generatedAt:'2026-08-21T00:00:00Z',generatedBy:'HR'}

beforeEach(()=>usePayrollStore.setState({employeePayrolls:[draft],payrollProposals:[],payrollProposalReviews:[]}))

describe('simplified payroll proposal workflow',()=>{
  it('allows HR adjustment but protects base salary',()=>{
    expect(usePayrollStore.getState().adjustEmployeePayrollByHr({payrollDraftId:'draft-1',adjustmentIdr:-10_000,reason:'Correct bonus evidence',actor:hr}).ok).toBe(true)
    expect(usePayrollStore.getState().employeePayrolls[0]).toMatchObject({hrAdjustmentIdr:-10_000,finalPayrollIdr:4_010_000})
    expect(usePayrollStore.getState().adjustEmployeePayrollByHr({payrollDraftId:'draft-1',adjustmentIdr:-30_000,reason:'Too much',actor:hr})).toMatchObject({ok:false,code:'calculation_mismatch'})
  })

  it('does not allow Finance to edit HR adjustments',()=>{
    expect(usePayrollStore.getState().adjustEmployeePayrollByHr({payrollDraftId:'draft-1',adjustmentIdr:10_000,reason:'Finance edit',actor:finance})).toMatchObject({ok:false,code:'forbidden'})
  })

})
