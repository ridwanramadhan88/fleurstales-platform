import { expect, it } from 'vitest'
import { buildHrProblems, getHrProblemStatus } from './hrProblemDomain'
import type { Employee, AttendanceReviewCase } from '../store/hrStoreTypes'
import type { OrderTableRow } from '../types/orders'

const employee:Employee={id:'admin-1',name:'Akbar',position:'Admin',branch:'Kedamaian',systemRole:'admin',status:'active',phone:'',hireDate:'2025-01-01'}

it('normalizes attendance and finance incidents without duplicates',()=>{
  const attendanceCase:AttendanceReviewCase={id:'case-1',attendanceId:'att-1',employeeId:'admin-1',date:'2026-07-01',warningType:'missing_check_in',status:'problem',reason:'No check-in',createdAt:'2026-07-01T01:00:00Z'}
  const order={id:'order-1',orderNumber:'ORD-1',customerName:'Customer',branch:'Kedamaian',status:'delivered',paymentStatus:'paid',paymentMethod:'cash',fulfillment:'delivery',totalIdr:1,createdAtLabel:'Today',adminHandledEmployeeId:'admin-1',financeVerificationStatus:'rejected',financeVerificationAt:'2026-07-02T01:00:00Z'} as OrderTableRow
  const problems=buildHrProblems({employees:[employee],attendanceCases:[attendanceCase,attendanceCase],orders:[order]})
  expect(problems).toHaveLength(2)
  expect(problems.map((problem)=>problem.source)).toEqual(expect.arrayContaining(['attendance','finance']))
})


it('excludes resolved attendance cases and ignores standalone mirror status for active attendance problems',()=>{
  const active:AttendanceReviewCase={id:'case-active',attendanceId:'att-active',employeeId:'admin-1',date:'2026-07-03',warningType:'missing_check_out',status:'problem',reason:'No checkout',createdAt:'2026-07-03T01:00:00Z'}
  const resolved:AttendanceReviewCase={...active,id:'case-resolved',status:'resolved'}
  const problems=buildHrProblems({employees:[employee],attendanceCases:[active,resolved],orders:[]})
  expect(problems.map((problem)=>problem.id)).toEqual(['attendance:case-active'])
  expect(getHrProblemStatus(problems[0], 'solved')).toBe('open')
})
