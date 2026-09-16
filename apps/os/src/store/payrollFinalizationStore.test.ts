import { beforeEach, describe, expect, it } from 'vitest'
import { usePayrollStore, type EmployeePayrollDraft, type PayrollProposal } from './payrollStore'
import { useFinanceStore } from './financeStore'

const draft:EmployeePayrollDraft={id:'draft-1',payrollPeriodId:'period-1',employeeId:'emp-agus',employeeName:'Agus',employeeRole:'florist',baseSalaryIdr:4_000_000,positivePoints:10,negativePoints:0,netPoints:10,bonusIdr:10_000,finalPayrollIdr:4_010_000,pointEntries:[{id:'point-1',category:'manual_reward',points:10,reason:'Reward',sourceType:'manual',sourceId:'manual-1',createdAt:'2026-08-20T00:00:00Z'}],status:'finance_verified',generatedAt:'2026-08-21T00:00:00Z',generatedBy:'HR'}
const approved:PayrollProposal={id:'proposal-1',payrollPeriodId:'period-1',status:'finance_approved',employeePayrollIds:['draft-1'],totalBaseSalaryIdr:4_000_000,totalBonusIdr:10_000,totalAdjustmentsIdr:0,totalPayrollIdr:4_010_000,createdAt:'2026-08-24T00:00:00Z',createdBy:'HR'}

beforeEach(()=>{
  usePayrollStore.setState({employeePayrolls:[draft],payrollProposals:[approved],payrollProposalReviews:[]})
  useFinanceStore.setState({transactions:[]})
})

describe('legacy payroll proposal final payment fallback',()=>{
  it('keeps payroll unpaid when the local fallback has no paid-from account',()=>{
    const result=usePayrollStore.getState().recordPayrollProposalPayment({payrollProposalId:'proposal-1',paymentDate:'2026-08-28',paymentMethod:'Bank transfer',paymentReference:'PAY-001',note:'',actor:{name:'Dewi',role:'finance'}})
    expect(result).toMatchObject({ok:false,code:'ledger_error'})
    expect(usePayrollStore.getState().payrollProposals[0].status).toBe('finance_approved')
    expect(usePayrollStore.getState().employeePayrolls[0].status).toBe('finance_verified')
    expect(useFinanceStore.getState().transactions).toHaveLength(0)
  })

  it('does not allow HR or Owner to resolve an approved employee payroll while payment remains unrecorded',()=>{
    expect(usePayrollStore.getState().resolveRejectedEmployeePayroll({payrollDraftId:'draft-1',reason:'cancel',actor:{name:'Owner',role:'owner'}})).toMatchObject({ok:false,code:'invalid_status'})
    expect(usePayrollStore.getState().payrollProposals[0].status).toBe('finance_approved')
    expect(usePayrollStore.getState().employeePayrolls[0].status).toBe('finance_verified')
  })
})
