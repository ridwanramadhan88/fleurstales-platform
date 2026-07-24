import { beforeEach, describe, expect, it } from 'vitest'
import { usePayrollStore, type PayrollPeriod } from './payrollStore'
import { useHrStore } from './hrStore'

const period:PayrollPeriod={id:'payroll-2026-08',periodStart:'2026-07-21',periodEnd:'2026-08-20',hrSubmissionDeadline:'2026-08-24',financeReviewDeadline:'2026-08-27',paymentDate:'2026-08-28',status:'hr_preparation',createdAt:'x',source:'owner_defaults'}

describe('payroll readiness and schedule locking',()=>{
 beforeEach(()=>{
  usePayrollStore.setState({periods:[period],employeePayrolls:[{id:'d1',payrollPeriodId:period.id,employeeId:'e1',employeeName:'E',employeeRole:'florist',baseSalaryIdr:1_000_000,positivePoints:0,negativePoints:0,netPoints:0,bonusIdr:0,finalPayrollIdr:1_000_000,pointEntries:[],status:'draft',generatedAt:'x',generatedBy:'HR'}],payrollProposals:[],payrollReviews:[],payrollProposalReviews:[],payrollScheduleAdjustments:[]})
  useHrStore.setState({attendanceReviewCases:[{id:'r1',attendanceId:'a1',employeeId:'e1',date:'2026-08-10',warningType:'late_check_in',status:'pending',reason:'Late',createdAt:'x'}],employeePointEntries:[]})
 })
 it('allows submission with attendance warnings and snapshots the warning',()=>{
  const result=usePayrollStore.getState().submitPayrollToFinance({payrollPeriodId:period.id,actor:{name:'HR',role:'hr'}})
  expect(result).toMatchObject({ok:true})
  expect(usePayrollStore.getState().payrollProposals[0].warnings).toContain('Attendance warnings remain unresolved.')
 })
 it('blocks schedule changes after proposal approval',()=>{
  usePayrollStore.setState({payrollProposals:[{id:'p1',payrollPeriodId:period.id,status:'finance_approved',employeePayrollIds:['d1'],totalBaseSalaryIdr:1_000_000,totalBonusIdr:0,totalAdjustmentsIdr:0,totalPayrollIdr:1_000_000,createdAt:'x',createdBy:'HR'}]})
  const result=usePayrollStore.getState().adjustPayrollSchedule({payrollPeriodId:period.id,proposed:{...period,financeReviewDeadline:'2026-08-26'},reason:'change',actor:{name:'Finance',role:'finance'}})
  expect(result).toMatchObject({ok:false,code:'invalid_status'})
 })
})
