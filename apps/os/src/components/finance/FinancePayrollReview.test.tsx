import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { FinancePayrollReview } from './FinancePayrollReview'
import { usePayrollStore, type EmployeePayrollDraft, type PayrollProposal } from '../../store/payrollStore'
import { useUserStore } from '../../store/userStore'

const makeDraft=(id:string,name:string):EmployeePayrollDraft=>({id,payrollPeriodId:'period-1',employeeId:`emp-${id}`,employeeName:name,employeeRole:'florist',baseSalaryIdr:4_000_000,positivePoints:10,negativePoints:0,netPoints:10,bonusIdr:10_000,finalPayrollIdr:4_010_000,pointEntries:[{id:`point-${id}`,category:'florist_assignment',points:10,reason:'Extra florist assignment',sourceType:'order',sourceId:`order:${id}`,orderNumber:`ORD-${id}`,createdAt:'2026-08-20T00:00:00Z'}],status:'pending_finance_review',generatedAt:'2026-08-21T00:00:00Z',generatedBy:'HR'})
const drafts=[makeDraft('draft-1','Agus'),makeDraft('draft-2','Sari')]
const proposal:PayrollProposal={id:'proposal-1',payrollPeriodId:'period-1',status:'submitted_to_finance',employeePayrollIds:['draft-1','draft-2'],totalBaseSalaryIdr:8_000_000,totalBonusIdr:20_000,totalAdjustmentsIdr:0,totalPayrollIdr:8_020_000,createdAt:'2026-08-24T00:00:00Z',createdBy:'HR'}

beforeEach(()=>{
  useUserStore.setState({employeeId:'emp-dewi',name:'Dewi',username:'finance',role:'finance'})
  usePayrollStore.setState({employeePayrolls:drafts.map((item)=>({...item,pointEntries:item.pointEntries.map((entry)=>({...entry}))})),payrollProposals:[{...proposal,employeePayrollIds:[...proposal.employeePayrollIds]}],payrollProposalReviews:[],payrollReviews:[],periods:[{id:'period-1',periodStart:'2026-07-21',periodEnd:'2026-08-20',hrSubmissionDeadline:'2026-08-24',financeReviewDeadline:'2026-08-27',paymentDate:'2026-08-28',status:'finance_review',createdAt:'2026-08-21T00:00:00Z',source:'owner_defaults'}]})

})

describe('FinancePayrollReview',()=>{
  it('supports employee rejection inside a monthly proposal',()=>{
    render(<FinancePayrollReview/>)
    fireEvent.click(screen.getByRole('button',{name:'Review proposal'}))
    expect(screen.getAllByRole('button',{name:'Approve employee'})).toHaveLength(2)
    fireEvent.click(screen.getAllByRole('button',{name:'Reject employee'})[1])
    fireEvent.change(screen.getByLabelText('Payroll decision note'),{target:{value:'Review Sari points.'}})
    fireEvent.click(screen.getByRole('button',{name:'Return employee to HR'}))
    expect(usePayrollStore.getState().employeePayrolls.find((item)=>item.id==='draft-2')?.status).toBe('finance_rejected')
    expect(usePayrollStore.getState().employeePayrolls.find((item)=>item.id==='draft-1')?.status).toBe('pending_finance_review')
  })

  it('approves all employees with one group action',()=>{
    render(<FinancePayrollReview/>)
    fireEvent.click(screen.getByRole('button',{name:'Review proposal'}))
    fireEvent.click(screen.getByRole('button',{name:'Approve all remaining payroll'}))
    expect(screen.getByText('Group approval note · Optional')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button',{name:'Approve all remaining'}))
    expect(usePayrollStore.getState().payrollProposals[0].status).toBe('finance_approved')
  })

  it('clears the payment-reference error while keeping the optional note empty',()=>{
    usePayrollStore.setState({
      employeePayrolls:drafts.map((item)=>({...item,status:'finance_verified'})),
      payrollProposals:[{...proposal,status:'finance_approved'}],
      payrollProposalReviews:[],payrollReviews:[],
      periods:[{id:'period-1',periodStart:'2026-07-21',periodEnd:'2026-08-20',hrSubmissionDeadline:'2026-08-24',financeReviewDeadline:'2026-08-27',paymentDate:'2026-08-28',status:'finance_review',createdAt:'2026-08-21T00:00:00Z',source:'owner_defaults'}],
    })
    render(<FinancePayrollReview/>)
    fireEvent.click(screen.getByRole('tab',{name:'Approved'}))
    fireEvent.click(screen.getByRole('button',{name:'Review proposal'}))
    fireEvent.click(screen.getByRole('button',{name:'Record final payment'}))
    expect(screen.getByText('Note · Optional')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button',{name:'Confirm final payment'}))
    expect(screen.getByText('Payment reference is required.')).toBeInTheDocument()
    fireEvent.change(screen.getAllByRole('textbox')[0],{target:{value:'PAY-2026-07'}})
    expect(screen.queryByText('Payment reference is required.')).not.toBeInTheDocument()
  })
})
