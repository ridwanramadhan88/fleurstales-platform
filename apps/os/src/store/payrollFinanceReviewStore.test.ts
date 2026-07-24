import { beforeEach, describe, expect, it } from 'vitest'
import { usePayrollStore, type EmployeePayrollDraft, type PayrollProposal } from './payrollStore'
import { useHrStore } from './hrStore'

const finance={name:'Dewi',role:'finance' as const}
const hr={name:'Star',role:'hr' as const}
const makeDraft=(id:string,name:string):EmployeePayrollDraft=>({
  id,payrollPeriodId:'period-1',employeeId:`emp-${id}`,employeeName:name,employeeRole:'florist',baseSalaryIdr:4_000_000,positivePoints:10,negativePoints:0,netPoints:10,bonusIdr:10_000,finalPayrollIdr:4_010_000,pointEntries:[{id:`point-${id}`,category:'manual_reward',points:10,reason:'Reward',sourceType:'manual',sourceId:`manual-${id}`,createdAt:'2026-08-20T00:00:00Z'}],status:'pending_finance_review',generatedAt:'2026-08-21T00:00:00Z',generatedBy:'HR',submittedAt:'2026-08-24T00:00:00Z',submittedBy:'HR'
})
const draft1=makeDraft('draft-1','Rina')
const draft2=makeDraft('draft-2','Sari')
const proposal:PayrollProposal={id:'proposal-1',payrollPeriodId:'period-1',status:'submitted_to_finance',employeePayrollIds:['draft-1','draft-2'],totalBaseSalaryIdr:8_000_000,totalBonusIdr:20_000,totalAdjustmentsIdr:0,totalPayrollIdr:8_020_000,createdAt:'2026-08-24T00:00:00Z',createdBy:'HR',submittedAt:'2026-08-24T00:00:00Z',submittedBy:'HR'}

beforeEach(()=>{
  useHrStore.setState({employeePointEntries:[]})
  usePayrollStore.setState({employeePayrolls:[draft1,draft2],payrollProposals:[proposal],payrollProposalReviews:[],payrollReviews:[],periods:[{id:'period-1',periodStart:'2026-07-21',periodEnd:'2026-08-20',hrSubmissionDeadline:'2026-08-24',financeReviewDeadline:'2026-08-27',paymentDate:'2026-08-28',status:'finance_review',createdAt:'2026-08-21T00:00:00Z',source:'owner_defaults'}]})
})

describe('group proposal with employee-level Finance review',()=>{
  it('allows Finance to approve the complete proposal at once',()=>{
    expect(usePayrollStore.getState().approvePayrollProposal({payrollProposalId:'proposal-1',note:'All totals reviewed.',actor:hr})).toMatchObject({ok:false,code:'forbidden'})
    expect(usePayrollStore.getState().approvePayrollProposal({payrollProposalId:'proposal-1',note:'',actor:finance}).ok).toBe(true)
    expect(usePayrollStore.getState().payrollProposals[0].status).toBe('finance_approved')
    expect(usePayrollStore.getState().employeePayrolls.every((item)=>item.status==='finance_verified')).toBe(true)
  })

  it('keeps approved employees accepted when another employee is rejected',()=>{
    expect(usePayrollStore.getState().verifyEmployeePayroll({payrollDraftId:'draft-1',note:'',actor:finance}).ok).toBe(true)
    expect(usePayrollStore.getState().rejectEmployeePayroll({payrollDraftId:'draft-2',note:'Check duplicate points.',actor:finance}).ok).toBe(true)
    expect(usePayrollStore.getState().employeePayrolls.find((item)=>item.id==='draft-1')?.status).toBe('finance_verified')
    expect(usePayrollStore.getState().employeePayrolls.find((item)=>item.id==='draft-2')?.status).toBe('finance_rejected')
    expect(usePayrollStore.getState().payrollProposals[0].status).toBe('returned_to_hr')
  })

  it('resubmits only the rejected employee while preserving accepted employees',()=>{
    usePayrollStore.setState({
      employeePayrolls:[{...draft1,status:'finance_verified'},{...draft2,status:'finance_rejected',rejectionReason:'Check duplicate points.'}],
      payrollProposals:[{...proposal,status:'returned_to_hr'}],
    })
    expect(usePayrollStore.getState().submitPayrollToFinance({payrollPeriodId:'period-1',actor:hr}).ok).toBe(true)
    expect(usePayrollStore.getState().employeePayrolls.find((item)=>item.id==='draft-1')?.status).toBe('finance_verified')
    expect(usePayrollStore.getState().employeePayrolls.find((item)=>item.id==='draft-2')?.status).toBe('pending_finance_review')
  })

  it('lets HR resolve one rejected employee without undoing accepted payrolls',()=>{
    usePayrollStore.setState({
      employeePayrolls:[{...draft1,status:'finance_verified'},{...draft2,status:'finance_rejected',rejectionReason:'Not payable this month.'}],
      payrollProposals:[{...proposal,status:'returned_to_hr'}],
    })
    expect(usePayrollStore.getState().resolveRejectedEmployeePayroll({payrollDraftId:'draft-2',reason:'Move to next payroll period.',actor:hr}).ok).toBe(true)
    expect(usePayrollStore.getState().employeePayrolls.find((item)=>item.id==='draft-1')?.status).toBe('finance_verified')
    expect(usePayrollStore.getState().employeePayrolls.find((item)=>item.id==='draft-2')?.status).toBe('resolved')
    expect(usePayrollStore.getState().payrollProposals[0]).toMatchObject({status:'finance_approved',employeePayrollIds:['draft-1']})
  })
})
