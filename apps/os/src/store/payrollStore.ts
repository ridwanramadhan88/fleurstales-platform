import { create } from 'zustand'
import { getCurrentPayrollSchedule, getPayrollPeriodKey, getPayrollScheduleStage, type PayrollScheduleSnapshot } from '../domain/payrollScheduleDomain'
import { calculateEmployeePayroll, isCompensationEffectiveForDate, isPointEntryInsidePayrollPeriod } from '../domain/payrollPreparationDomain'
import { useSettingsStore } from './settingsStore'
import { hasActionPermission } from '../config/actionPermissions'
import { isActionAuthorized } from '../config/authorization'
import { useHrStore } from './hrStore'
import { useFinanceStore } from './financeStore'
import type { EmployeePointEntry } from './hrStoreTypes'
import type { UserRole } from './userStore'
import { validatePayrollForFinance } from '../domain/payrollFinanceReviewDomain'
import { evaluatePayrollScheduleAdjustment, payrollPeriodsOverlap, validatePayrollScheduleSnapshot } from '../domain/payrollScheduleAdjustmentDomain'

export type PayrollPeriodStatus = 'upcoming' | 'hr_preparation' | 'finance_review' | 'payment_due' | 'overdue'
export interface PayrollPeriod extends PayrollScheduleSnapshot {
  id: string
  status: PayrollPeriodStatus
  createdAt: string
  source: 'owner_defaults' | 'finance_adjustment'
  lastAdjustedAt?: string
  lastAdjustedBy?: string
}

export interface EmployeeCompensation {
  id: string
  employeeId: string
  baseSalaryIdr: number
  effectiveFrom: string
  effectiveTo?: string
  createdBy: string
  createdAt: string
}

export type EmployeePayrollStatus = 'draft' | 'pending_finance_review' | 'finance_rejected' | 'finance_verified' | 'paid' | 'resolved'

export interface PayrollPointSnapshot {
  id: string
  category: EmployeePointEntry['category']
  points: number
  reason: string
  sourceType: EmployeePointEntry['sourceType']
  sourceId: string
  orderNumber?: string
  createdAt: string
  effectiveDate?: string
  payrollPeriodId?: string
}

export interface EmployeePayrollDraft {
  id: string
  payrollPeriodId: string
  employeeId: string
  employeeName: string
  employeeRole: UserRole
  compensationId?: string
  baseSalaryIdr: number
  positivePoints: number
  negativePoints: number
  netPoints: number
  bonusIdr: number
  finalPayrollIdr: number
  hrAdjustmentIdr?: number
  hrAdjustmentReason?: string
  pointEntries: PayrollPointSnapshot[]
  status: EmployeePayrollStatus
  generatedAt: string
  generatedBy: string
  submittedAt?: string
  submittedBy?: string
  rejectionReason?: string
  financeReviewedAt?: string
  financeReviewedBy?: string
  paidAt?: string
  paidBy?: string
  paymentMethod?: string
  paymentReference?: string
  paymentNote?: string
  resolvedAt?: string
  resolvedBy?: string
  resolutionReason?: string
}


export type PayrollProposalStatus = 'draft' | 'submitted_to_finance' | 'returned_to_hr' | 'finance_approved' | 'paid' | 'resolved'
export interface PayrollProposal {
  id: string
  payrollPeriodId: string
  status: PayrollProposalStatus
  employeePayrollIds: string[]
  totalBaseSalaryIdr: number
  totalBonusIdr: number
  totalAdjustmentsIdr: number
  totalPayrollIdr: number
  createdAt: string
  createdBy: string
  submittedAt?: string
  submittedBy?: string
  financeDecisionAt?: string
  financeDecisionBy?: string
  financeNote?: string
  warnings?: string[]
  paidAt?: string
  paidBy?: string
  paymentMethod?: string
  paymentReference?: string
  paymentNote?: string
  resolvedAt?: string
  resolvedBy?: string
  resolutionReason?: string
}

export interface PayrollProposalReviewRecord {
  id: string
  payrollProposalId: string
  payrollPeriodId: string
  decision: 'approved' | 'rejected' | 'paid' | 'resolved'
  note?: string
  actorName: string
  actorRole: UserRole
  createdAt: string
}


export type PayrollScheduleAdjustmentStatus = 'applied' | 'pending_owner_approval' | 'approved' | 'rejected'
export interface PayrollScheduleAdjustmentRecord {
  id:string
  payrollPeriodId:string
  previousValues:PayrollScheduleSnapshot
  newValues:PayrollScheduleSnapshot
  reason:string
  status:PayrollScheduleAdjustmentStatus
  impactReasons:string[]
  changedBy:string
  changedByRole:UserRole
  changedAt:string
  approvedBy?:string
  approvedAt?:string
  rejectedBy?:string
  rejectedAt?:string
  decisionNote?:string
}

export type PayrollReviewDecision = 'verified' | 'rejected' | 'paid' | 'resolved'
export interface PayrollReviewRecord {
  id: string
  payrollDraftId: string
  payrollPeriodId: string
  employeeId: string
  decision: PayrollReviewDecision
  note?: string
  actorName: string
  actorRole: UserRole
  createdAt: string
}

export type PayrollCommandResult =
  | { ok: true; affected?: number; draftId?: string; proposalId?: string; compensationId?: string; adjustmentId?:string; status?:PayrollScheduleAdjustmentStatus }
  | { ok: false; code: 'forbidden' | 'not_found' | 'invalid_salary' | 'invalid_date' | 'missing_salary' | 'pending_points' | 'pending_attendance' | 'invalid_status' | 'empty_payroll' | 'note_required' | 'calculation_mismatch' | 'invalid_schedule' | 'overlapping_period' | 'decision_required' | 'payment_details_required' | 'ledger_error'; reason: string; employeeIds?: string[]; fieldErrors?:Record<string,string> }

interface PayrollStoreState {
  periods: PayrollPeriod[]
  compensations: EmployeeCompensation[]
  employeePayrolls: EmployeePayrollDraft[]
  payrollReviews: PayrollReviewRecord[]
  payrollProposals: PayrollProposal[]
  payrollProposalReviews: PayrollProposalReviewRecord[]
  payrollScheduleAdjustments: PayrollScheduleAdjustmentRecord[]
  ensureCurrentPeriod: (now?: Date) => PayrollPeriod
  setEmployeeCompensation: (params: { employeeId:string; baseSalaryIdr:number; effectiveFrom:string; actor:{ name:string; role:UserRole } }) => PayrollCommandResult
  generateEmployeePayrollDrafts: (params: { payrollPeriodId:string; actor:{ name:string; role:UserRole } }) => PayrollCommandResult
  adjustEmployeePayrollByHr: (params: { payrollDraftId:string; adjustmentIdr:number; reason:string; actor:{ name:string; role:UserRole } }) => PayrollCommandResult
  submitPayrollToFinance: (params: { payrollPeriodId:string; actor:{ name:string; role:UserRole } }) => PayrollCommandResult
  approvePayrollProposal: (params: { payrollProposalId:string; note?:string; actor:{ employeeId?:string; name:string; role:UserRole } }) => PayrollCommandResult
  resolveRejectedEmployeePayroll: (params: { payrollDraftId:string; reason:string; actor:{ name:string; role:UserRole } }) => PayrollCommandResult
  recordPayrollProposalPayment: (params: { payrollProposalId:string; paymentDate:string; paymentMethod:string; paymentReference:string; note?:string; actor:{ name:string; role:UserRole } }) => PayrollCommandResult
  verifyEmployeePayroll: (params: { payrollDraftId:string; note?:string; actor:{ employeeId?:string; name:string; role:UserRole } }) => PayrollCommandResult
  rejectEmployeePayroll: (params: { payrollDraftId:string; note:string; actor:{ employeeId?:string; name:string; role:UserRole } }) => PayrollCommandResult
  adjustPayrollSchedule: (params:{ payrollPeriodId:string; proposed:PayrollScheduleSnapshot; reason:string; actor:{ name:string; role:UserRole }; now?:Date }) => PayrollCommandResult
}

const localToday = (date: Date, timezone: string) => new Intl.DateTimeFormat('en-CA', {
  timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
}).format(date)

const previousDay = (isoDate: string): string => {
  const date = new Date(`${isoDate}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() - 1)
  return date.toISOString().slice(0, 10)
}

const summarizePayrollDrafts = (drafts:EmployeePayrollDraft[]) => ({
  totalBaseSalaryIdr:drafts.reduce((sum,item)=>sum+item.baseSalaryIdr,0),
  totalBonusIdr:drafts.reduce((sum,item)=>sum+item.bonusIdr,0),
  totalAdjustmentsIdr:drafts.reduce((sum,item)=>sum+(item.hrAdjustmentIdr ?? 0),0),
  totalPayrollIdr:drafts.reduce((sum,item)=>sum+item.finalPayrollIdr,0),
})

const deriveProposalReviewStatus = (drafts:EmployeePayrollDraft[]):PayrollProposalStatus => {
  if (drafts.length > 0 && drafts.every((draft)=>draft.status === 'finance_verified')) return 'finance_approved'
  if (drafts.some((draft)=>draft.status === 'finance_rejected')) return 'returned_to_hr'
  return 'submitted_to_finance'
}

const isActorOwnPayroll = (
  draft: EmployeePayrollDraft,
  actor: { employeeId?: string; name: string; role: UserRole },
) => actor.role === 'finance' && (
  Boolean(actor.employeeId && draft.employeeId === actor.employeeId)
  || draft.employeeName.trim().toLocaleLowerCase() === actor.name.trim().toLocaleLowerCase()
)

const demoCompensations: EmployeeCompensation[] = [
  ['emp-budi', 7_000_000], ['emp-dewi', 5_000_000], ['emp-bintang', 4_500_000],
  ['emp-akbar', 4_500_000], ['emp-teta', 4_500_000], ['emp-shofi', 4_500_000],
  ['emp-zahra', 4_000_000], ['emp-vero', 4_000_000], ['emp-zizi', 4_000_000],
  ['emp-dela', 4_000_000], ['emp-dila', 4_000_000], ['emp-gaby', 4_000_000],
].map(([employeeId, salary]) => ({ id:`comp-${employeeId}-initial`, employeeId:String(employeeId), baseSalaryIdr:Number(salary), effectiveFrom:'2026-01-01', createdBy:'Demo setup', createdAt:'2026-01-01T00:00:00.000Z' }))

export const usePayrollStore = create<PayrollStoreState>((set, get) => ({
  periods: [],
  compensations: demoCompensations,
  employeePayrolls: [],
  payrollReviews: [],
  payrollProposals: [],
  payrollProposalReviews: [],
  payrollScheduleAdjustments: [],
  ensureCurrentPeriod: (now = new Date()) => {
    const localDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(now)
    const settings = useSettingsStore.getState().getPayrollSettingsForDate(localDate)
    const snapshot = getCurrentPayrollSchedule(now, settings)
    const id = `payroll-${getPayrollPeriodKey(snapshot)}`
    const existing = get().periods.find((period) => period.id === id)
    if (existing) return existing
    const period: PayrollPeriod = {
      id, ...snapshot,
      status: getPayrollScheduleStage(snapshot, localToday(now, settings.timezone)),
      createdAt: now.toISOString(), source: 'owner_defaults',
    }
    set((state) => ({ periods: [...state.periods, period] }))
    return period
  },

  setEmployeeCompensation: ({ employeeId, baseSalaryIdr, effectiveFrom, actor }) => {
    if (!isActionAuthorized(actor.role, 'hr.edit_payroll_proposal')) return { ok:false, code:'forbidden', reason:'This role cannot edit payroll preparation.' }
    if (actor.role !== 'owner') return { ok:false, code:'forbidden', reason:'Only Owner can change employee base salary.' }
    const compensationEmployee = useHrStore.getState().employees.find((employee) => employee.id === employeeId)
    if (!compensationEmployee) return { ok:false, code:'not_found', reason:'Employee was not found.' }
    if (compensationEmployee.systemRole === 'owner') return { ok:false, code:'forbidden', reason:'Owner salary is not managed from staff payroll.' }
    if (!Number.isInteger(baseSalaryIdr) || baseSalaryIdr <= 0) return { ok:false, code:'invalid_salary', reason:'Base salary must be a positive whole rupiah amount.' }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveFrom)) return { ok:false, code:'invalid_date', reason:'Select a valid effective date.' }
    const now = new Date().toISOString()
    const compensation: EmployeeCompensation = { id:`comp-${employeeId}-${Date.now()}`, employeeId, baseSalaryIdr, effectiveFrom, createdBy:actor.name, createdAt:now }
    set((state) => ({
      compensations: [
        ...state.compensations.map((item) => item.employeeId === employeeId && !item.effectiveTo && item.effectiveFrom < effectiveFrom ? { ...item, effectiveTo:previousDay(effectiveFrom) } : item),
        compensation,
      ],
    }))
    return { ok:true, compensationId:compensation.id }
  },

  generateEmployeePayrollDrafts: ({ payrollPeriodId, actor }) => {
    if (!isActionAuthorized(actor.role, 'hr.create_payroll_proposal')) return { ok:false, code:'forbidden', reason:'This role cannot create payroll proposals.' }
    if (!['owner', 'hr'].includes(actor.role)) return { ok:false, code:'forbidden', reason:'Only Owner or HR can prepare payroll.' }
    const period = get().periods.find((item) => item.id === payrollPeriodId)
    if (!period) return { ok:false, code:'not_found', reason:'Payroll period was not found.' }
    const hr = useHrStore.getState()
    const payrollSettings = useSettingsStore.getState().getPayrollSettingsForDate(period.periodEnd)
    const employees = hr.employees.filter((employee) => employee.status === 'active' && employee.hireDate <= period.periodEnd && employee.systemRole !== 'owner')
    if (!employees.length) return { ok:false, code:'empty_payroll', reason:'No active employees are eligible for this payroll period.' }
    const currentPeriodDrafts = get().employeePayrolls.filter((draft) => draft.payrollPeriodId === payrollPeriodId)
    if (currentPeriodDrafts.some((draft) => draft.status === 'pending_finance_review')) return { ok:false, code:'invalid_status', reason:'Payroll currently under Finance review cannot be regenerated.' }
    const existingByEmployee = new Map(currentPeriodDrafts.map((draft) => [draft.employeeId, draft]))
    const now = new Date().toISOString()
    const missingSalaryEmployees = employees.filter((employee) => !get().compensations.some((item) => item.employeeId === employee.id && isCompensationEffectiveForDate(item, period.periodEnd)) && (!employee.baseSalaryIdr || employee.baseSalaryIdr <= 0))
    if (missingSalaryEmployees.length) return { ok:false, code:'missing_salary', reason:'Set an individual base salary for every employee before generating payroll.', employeeIds:missingSalaryEmployees.map((employee)=>employee.id) }
    const drafts = employees.map((employee): EmployeePayrollDraft => {
      const compensation = get().compensations
        .filter((item) => item.employeeId === employee.id && isCompensationEffectiveForDate(item, period.periodEnd))
        .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0]
      const entries = hr.employeePointEntries.filter((entry) => entry.employeeId === employee.id && isPointEntryInsidePayrollPeriod(entry, period.periodStart, period.periodEnd))
      const baseSalaryIdr = compensation?.baseSalaryIdr ?? employee.baseSalaryIdr ?? 0
      const calculation = calculateEmployeePayroll(baseSalaryIdr, entries, payrollSettings.pointValueIdr)
      const existing = existingByEmployee.get(employee.id)
      if (existing && ['finance_verified','paid','resolved'].includes(existing.status)) return existing
      return {
        id: existing?.id ?? `payroll-draft-${payrollPeriodId}-${employee.id}`,
        payrollPeriodId,
        employeeId:employee.id,
        employeeName:employee.name,
        employeeRole:employee.systemRole,
        compensationId:compensation?.id,
        baseSalaryIdr,
        ...calculation,
        hrAdjustmentIdr: existing?.hrAdjustmentIdr ?? 0,
        hrAdjustmentReason: existing?.hrAdjustmentReason,
        finalPayrollIdr: Math.max(baseSalaryIdr, calculation.finalPayrollIdr + (existing?.hrAdjustmentIdr ?? 0)),
        pointEntries:entries.filter((entry) => entry.status === 'approved').map((entry) => ({ id:entry.id, category:entry.category, points:entry.points, reason:entry.reason, sourceType:entry.sourceType, sourceId:entry.sourceId, orderNumber:entry.orderNumber, createdAt:entry.createdAt, effectiveDate:entry.effectiveDate, payrollPeriodId:entry.payrollPeriodId })),
        status: 'draft',
        generatedAt:now,
        generatedBy:actor.name,
        rejectionReason:undefined,
      }
    })
    set((state) => ({ employeePayrolls:[...state.employeePayrolls.filter((draft) => draft.payrollPeriodId !== payrollPeriodId), ...drafts] }))
    return { ok:true, affected:drafts.length }
  },

  adjustEmployeePayrollByHr: ({ payrollDraftId, adjustmentIdr, reason, actor }) => {
    if (!isActionAuthorized(actor.role, 'hr.edit_payroll_proposal')) return { ok:false, code:'forbidden', reason:'This role cannot edit payroll proposals.' }
    if (!['owner','hr'].includes(actor.role)) return { ok:false, code:'forbidden', reason:'Only HR or Owner can adjust a payroll proposal.' }
    if (!Number.isInteger(adjustmentIdr)) return { ok:false, code:'calculation_mismatch', reason:'Adjustment must be a whole rupiah amount.' }
    const normalizedReason = reason.trim()
    if (adjustmentIdr !== 0 && !normalizedReason) return { ok:false, code:'note_required', reason:'Adjustment reason is required.' }
    const draft = get().employeePayrolls.find((item) => item.id === payrollDraftId)
    if (!draft) return { ok:false, code:'not_found', reason:'Employee payroll was not found.' }
    if (draft.employeeRole === 'owner') return { ok:false, code:'forbidden', reason:'Owner salary is not managed from staff payroll.' }
    const proposal = get().payrollProposals.find((item) => item.payrollPeriodId === draft.payrollPeriodId && item.status !== 'resolved')
    if (proposal && !['draft','returned_to_hr'].includes(proposal.status)) return { ok:false, code:'invalid_status', reason:'Payroll can only be adjusted by HR before Finance approval.' }
    if (!['draft','finance_rejected'].includes(draft.status)) return { ok:false, code:'invalid_status', reason:'This employee payroll is not editable by HR.' }
    const unadjusted = draft.baseSalaryIdr + draft.bonusIdr
    const finalPayrollIdr = unadjusted + adjustmentIdr
    if (finalPayrollIdr < draft.baseSalaryIdr) return { ok:false, code:'calculation_mismatch', reason:'An adjustment cannot reduce payroll below base salary.' }
    set((state) => ({ employeePayrolls:state.employeePayrolls.map((item) => item.id === payrollDraftId ? { ...item, hrAdjustmentIdr:adjustmentIdr, hrAdjustmentReason:normalizedReason || undefined, finalPayrollIdr } : item) }))
    return { ok:true, draftId:payrollDraftId }
  },

  submitPayrollToFinance: ({ payrollPeriodId, actor }) => {
    if (!isActionAuthorized(actor.role, 'hr.create_payroll_proposal')) return { ok:false, code:'forbidden', reason:'This role cannot submit payroll proposals.' }
    if (!['owner', 'hr'].includes(actor.role)) return { ok:false, code:'forbidden', reason:'Only Owner or HR can submit payroll.' }
    const period = get().periods.find((item) => item.id === payrollPeriodId)
    if (!period) return { ok:false, code:'not_found', reason:'Payroll period was not found.' }
    const drafts = get().employeePayrolls.filter((draft) => draft.payrollPeriodId === payrollPeriodId)
    const proposalDrafts = drafts.filter((draft) => draft.status !== 'resolved' && draft.employeeRole !== 'owner')
    if (!proposalDrafts.length) return { ok:false, code:'empty_payroll', reason:'Generate employee payroll drafts first.' }
    const activeProposal = get().payrollProposals.find((item) => item.payrollPeriodId === payrollPeriodId && item.status !== 'resolved')
    if (activeProposal && ['submitted_to_finance','finance_approved','paid'].includes(activeProposal.status)) return { ok:false, code:'invalid_status', reason:'This payroll proposal cannot be submitted in its current status.' }
    const missingSalary = proposalDrafts.filter((draft) => draft.baseSalaryIdr <= 0).map((draft) => draft.employeeId)
    if (missingSalary.length) return { ok:false, code:'missing_salary', reason:'Every employee needs an effective base salary before payroll can be submitted.', employeeIds:missingSalary }
    const hrStore = useHrStore.getState()
    hrStore.generateAttendanceWarnings(new Date())
    const warningMessages = [
      ...(useHrStore.getState().attendanceReviewCases.some((item) => item.status === 'pending' && item.date >= period.periodStart && item.date <= period.periodEnd) ? ['Attendance warnings remain unresolved.'] : []),
      ...(useHrStore.getState().employeePointEntries.some((entry) => entry.status === 'pending' && isPointEntryInsidePayrollPeriod(entry, period.periodStart, period.periodEnd)) ? ['Point entries remain pending review.'] : []),
    ]
    const validationFailure = proposalDrafts.find((draft) => !validatePayrollForFinance(draft).ok)
    if (validationFailure) return { ok:false, code:'calculation_mismatch', reason:`Payroll calculation is invalid for ${validationFailure.employeeName}.` }
    const now = new Date().toISOString()
    const totals = {
      totalBaseSalaryIdr:proposalDrafts.reduce((sum,item)=>sum+item.baseSalaryIdr,0),
      totalBonusIdr:proposalDrafts.reduce((sum,item)=>sum+item.bonusIdr,0),
      totalAdjustmentsIdr:proposalDrafts.reduce((sum,item)=>sum+(item.hrAdjustmentIdr ?? 0),0),
      totalPayrollIdr:proposalDrafts.reduce((sum,item)=>sum+item.finalPayrollIdr,0),
    }
    const proposal:PayrollProposal = activeProposal ? { ...activeProposal, ...totals, status:'submitted_to_finance', employeePayrollIds:proposalDrafts.map((item)=>item.id), submittedAt:now, submittedBy:actor.name, financeNote:undefined, warnings:warningMessages } : {
      id:`payroll-proposal-${payrollPeriodId}`, payrollPeriodId, status:'submitted_to_finance', employeePayrollIds:proposalDrafts.map((item)=>item.id), ...totals, createdAt:now, createdBy:actor.name, submittedAt:now, submittedBy:actor.name, warnings:warningMessages,
    }
    const resubmittedIds = new Set(proposalDrafts.filter((draft)=>['draft','finance_rejected'].includes(draft.status)).map((draft)=>draft.id))
    if (!resubmittedIds.size && proposalDrafts.every((draft)=>draft.status==='finance_verified')) return { ok:false, code:'invalid_status', reason:'Every employee payroll in this proposal is already approved.' }
    set((state) => ({
      payrollProposals:[...state.payrollProposals.filter((item)=>item.id!==proposal.id), proposal],
      employeePayrolls:state.employeePayrolls.map((draft)=>resubmittedIds.has(draft.id) ? { ...draft, status:'pending_finance_review', submittedAt:now, submittedBy:actor.name, rejectionReason:undefined } : draft),
    }))
    return { ok:true, affected:resubmittedIds.size, proposalId:proposal.id }
  },

  approvePayrollProposal: ({ payrollProposalId, note, actor }) => {
    if (!hasActionPermission(actor.role, 'finance.approve_all_payroll', useSettingsStore.getState().actionPermissions, useSettingsStore.getState().permissions)) return { ok:false, code:'forbidden', reason:'This role cannot approve complete payroll proposals.' }
    const normalizedNote = (note ?? '').trim()
    const proposal = get().payrollProposals.find((item)=>item.id===payrollProposalId)
    if (!proposal) return { ok:false, code:'not_found', reason:'Payroll proposal was not found.' }
    if (!['submitted_to_finance','returned_to_hr'].includes(proposal.status)) return { ok:false, code:'invalid_status', reason:'Only an active Finance review can be approved.' }
    const drafts = get().employeePayrolls.filter((item)=>proposal.employeePayrollIds.includes(item.id))
    if (!drafts.length) return { ok:false, code:'empty_payroll', reason:'This proposal has no employee payrolls.' }
    if (drafts.some((draft)=>draft.status==='finance_rejected')) return { ok:false, code:'invalid_status', reason:'Resolve and resubmit rejected employee payrolls before approving the complete proposal.' }
    const candidates=drafts.filter((draft)=>draft.status==='pending_finance_review')
    const ownPayroll = candidates.find((draft)=>isActorOwnPayroll(draft, actor))
    if (ownPayroll) return { ok:false, code:'forbidden', reason:'Another Finance reviewer or Owner must approve your payroll before group approval.' }
    if (!candidates.length) return { ok:false, code:'invalid_status', reason:'No employee payroll is waiting for Finance approval.' }
    const invalid = candidates.find((draft)=>!validatePayrollForFinance(draft).ok)
    if (invalid) return { ok:false, code:'calculation_mismatch', reason:`Payroll calculation is invalid for ${invalid.employeeName}.` }
    const now=new Date().toISOString()
    const review:PayrollProposalReviewRecord={ id:`proposal-review-${Date.now()}`, payrollProposalId:proposal.id, payrollPeriodId:proposal.payrollPeriodId, decision:'approved', ...(normalizedNote ? { note:normalizedNote } : {}), actorName:actor.name, actorRole:actor.role, createdAt:now }
    set((state)=>({
      payrollProposals:state.payrollProposals.map((item)=>item.id===proposal.id ? { ...item, status:'finance_approved', financeDecisionAt:now, financeDecisionBy:actor.name, financeNote:normalizedNote || undefined } : item),
      employeePayrolls:state.employeePayrolls.map((draft)=>candidates.some((candidate)=>candidate.id===draft.id) ? { ...draft, status:'finance_verified', financeReviewedAt:now, financeReviewedBy:actor.name, rejectionReason:undefined } : draft),
      payrollProposalReviews:[...state.payrollProposalReviews, review],
    }))
    return { ok:true, proposalId:proposal.id, affected:candidates.length }
  },

  resolveRejectedEmployeePayroll: ({ payrollDraftId, reason, actor }) => {
    if (!isActionAuthorized(actor.role, 'hr.resolve_rejected_employee')) return { ok:false, code:'forbidden', reason:'This role cannot resolve rejected payroll employees.' }
    if (!['owner','hr'].includes(actor.role)) return {ok:false,code:'forbidden',reason:'Only HR or Owner can resolve a rejected employee payroll.'}
    const normalizedReason=reason.trim()
    if (!normalizedReason) return {ok:false,code:'note_required',reason:'Resolution reason is required.'}
    const draft=get().employeePayrolls.find((item)=>item.id===payrollDraftId)
    if (!draft) return {ok:false,code:'not_found',reason:'Employee payroll was not found.'}
    if (draft.status!=='finance_rejected') return {ok:false,code:'invalid_status',reason:'Only a rejected employee payroll can be resolved.'}
    const proposal=get().payrollProposals.find((item)=>item.employeePayrollIds.includes(draft.id)&&item.status==='returned_to_hr')
    if (!proposal) return {ok:false,code:'invalid_status',reason:'The rejected employee payroll is not inside a returned proposal.'}
    const now=new Date().toISOString()
    const remainingIds=proposal.employeePayrollIds.filter((id)=>id!==draft.id)
    const remainingDrafts=get().employeePayrolls.filter((item)=>remainingIds.includes(item.id))
    if (!remainingIds.length) return {ok:false,code:'empty_payroll',reason:'A payroll proposal must keep at least one employee.'}
    const nextStatus=deriveProposalReviewStatus(remainingDrafts)
    const totals=summarizePayrollDrafts(remainingDrafts)
    const review:PayrollReviewRecord={id:`payroll-review-${Date.now()}`,payrollDraftId:draft.id,payrollPeriodId:draft.payrollPeriodId,employeeId:draft.employeeId,decision:'resolved',note:normalizedReason,actorName:actor.name,actorRole:actor.role,createdAt:now}
    set((state)=>({
      employeePayrolls:state.employeePayrolls.map((item)=>item.id===draft.id?{...item,status:'resolved',resolvedAt:now,resolvedBy:actor.name,resolutionReason:normalizedReason}:item),
      payrollProposals:state.payrollProposals.map((item)=>item.id===proposal.id?{...item,employeePayrollIds:remainingIds,...totals,status:nextStatus,financeNote:nextStatus==='returned_to_hr'?item.financeNote:undefined}:item),
      payrollReviews:[...state.payrollReviews,review],
    }))
    return {ok:true,draftId:draft.id,proposalId:proposal.id}
  },

  recordPayrollProposalPayment: ({ payrollProposalId, paymentDate, paymentMethod, paymentReference, note, actor }) => {
    if (!hasActionPermission(actor.role, 'finance.record_final_payment', useSettingsStore.getState().actionPermissions, useSettingsStore.getState().permissions)) return { ok:false, code:'forbidden', reason:'This role cannot record final payroll payments.' }
    const normalizedMethod=paymentMethod.trim(), normalizedReference=paymentReference.trim(), normalizedNote=(note ?? '').trim()
    const fieldErrors:Record<string,string>={}
    if (!/^\d{4}-\d{2}-\d{2}$/.test(paymentDate)) fieldErrors.paymentDate='Select a valid payment date.'
    if (!normalizedMethod) fieldErrors.paymentMethod='Payment method is required.'
    if (!normalizedReference) fieldErrors.paymentReference='Payment reference is required.'
    if (Object.keys(fieldErrors).length) return { ok:false, code:'payment_details_required', reason:'Complete the payroll payment details.', fieldErrors }
    const proposal=get().payrollProposals.find((item)=>item.id===payrollProposalId)
    if (!proposal) return { ok:false, code:'not_found', reason:'Payroll proposal was not found.' }
    if (proposal.status!=='finance_approved') return { ok:false, code:'invalid_status', reason:'Only Finance-approved payroll can be paid.' }
    const period=get().periods.find((item)=>item.id===proposal.payrollPeriodId)
    const periodLabel=period ? `${period.periodStart} - ${period.periodEnd}` : proposal.payrollPeriodId
    const ledgerResult=useFinanceStore.getState().recordPayrollExpense({
      payrollProposalId:proposal.id,
      payrollPeriodId:proposal.payrollPeriodId,
      periodLabel,
      amount:proposal.totalPayrollIdr,
      paymentDate,
      paymentMethod:normalizedMethod,
      paymentReference:normalizedReference,
      note:normalizedNote || undefined,
      idempotencyKey:`payroll-expense:${proposal.id}`,
      actor:actor.name,
    })
    if (!ledgerResult.allowed) return { ok:false, code:'ledger_error', reason:ledgerResult.reason ?? 'Unable to create the payroll expense.' }
    const now=new Date().toISOString()
    const review:PayrollProposalReviewRecord={ id:`proposal-review-${Date.now()}`, payrollProposalId:proposal.id, payrollPeriodId:proposal.payrollPeriodId, decision:'paid', note:normalizedNote || `Paid via ${normalizedMethod}.`, actorName:actor.name, actorRole:actor.role, createdAt:now }
    set((state)=>({
      payrollProposals:state.payrollProposals.map((item)=>item.id===proposal.id ? { ...item, status:'paid', paidAt:paymentDate, paidBy:actor.name, paymentMethod:normalizedMethod, paymentReference:normalizedReference, paymentNote:normalizedNote || undefined } : item),
      employeePayrolls:state.employeePayrolls.map((draft)=>proposal.employeePayrollIds.includes(draft.id) ? { ...draft, status:'paid', paidAt:paymentDate, paidBy:actor.name, paymentMethod:normalizedMethod, paymentReference:normalizedReference, paymentNote:normalizedNote || undefined } : draft),
      payrollProposalReviews:[...state.payrollProposalReviews, review],
    }))
    return { ok:true, proposalId:proposal.id, affected:proposal.employeePayrollIds.length }
  },

  verifyEmployeePayroll: ({ payrollDraftId, note, actor }) => {
    if (!hasActionPermission(actor.role, 'finance.approve_employee_payroll', useSettingsStore.getState().actionPermissions, useSettingsStore.getState().permissions)) return { ok:false, code:'forbidden', reason:'This role cannot approve employee payroll.' }
    const normalizedNote=(note ?? '').trim()
    const draft=get().employeePayrolls.find((item)=>item.id===payrollDraftId)
    if (!draft) return { ok:false, code:'not_found', reason:'Employee payroll was not found.' }
    if (draft.status!=='pending_finance_review') return { ok:false, code:'invalid_status', reason:'Only pending employee payroll can be approved.' }
    if (isActorOwnPayroll(draft, actor)) return { ok:false, code:'forbidden', reason:'Another Finance reviewer or Owner must approve your payroll.' }
    const proposal=get().payrollProposals.find((item)=>item.employeePayrollIds.includes(draft.id)&&['submitted_to_finance','returned_to_hr'].includes(item.status))
    if (!proposal) return { ok:false, code:'invalid_status', reason:'This employee payroll is not inside an active proposal.' }
    const validation=validatePayrollForFinance(draft)
    if (!validation.ok) return { ok:false, code:'calculation_mismatch', reason:validation.reason }
    const now=new Date().toISOString()
    const review:PayrollReviewRecord={id:`payroll-review-${Date.now()}`,payrollDraftId:draft.id,payrollPeriodId:draft.payrollPeriodId,employeeId:draft.employeeId,decision:'verified',...(normalizedNote ? {note:normalizedNote} : {}),actorName:actor.name,actorRole:actor.role,createdAt:now}
    const nextDrafts=get().employeePayrolls.filter((item)=>proposal.employeePayrollIds.includes(item.id)).map((item)=>item.id===draft.id?{...item,status:'finance_verified' as const,financeReviewedAt:now,financeReviewedBy:actor.name,rejectionReason:undefined}:item)
    const nextStatus=deriveProposalReviewStatus(nextDrafts)
    set((state)=>({
      employeePayrolls:state.employeePayrolls.map((item)=>item.id===draft.id?{...item,status:'finance_verified',financeReviewedAt:now,financeReviewedBy:actor.name,rejectionReason:undefined}:item),
      payrollProposals:state.payrollProposals.map((item)=>item.id===proposal.id?{...item,status:nextStatus,financeDecisionAt:nextStatus==='finance_approved'?now:item.financeDecisionAt,financeDecisionBy:nextStatus==='finance_approved'?actor.name:item.financeDecisionBy}:item),
      payrollReviews:[...state.payrollReviews,review],
    }))
    return {ok:true,draftId:draft.id,proposalId:proposal.id}
  },
  rejectEmployeePayroll: ({ payrollDraftId, note, actor }) => {
    if (!hasActionPermission(actor.role, 'finance.reject_employee_payroll', useSettingsStore.getState().actionPermissions, useSettingsStore.getState().permissions)) return { ok:false, code:'forbidden', reason:'This role cannot reject employee payroll.' }
    const normalizedNote=note.trim()
    if (!normalizedNote) return { ok:false, code:'note_required', reason:'Employee rejection reason is required.' }
    const draft=get().employeePayrolls.find((item)=>item.id===payrollDraftId)
    if (!draft) return { ok:false, code:'not_found', reason:'Employee payroll was not found.' }
    if (draft.status!=='pending_finance_review') return { ok:false, code:'invalid_status', reason:'Only pending employee payroll can be rejected.' }
    if (isActorOwnPayroll(draft, actor)) return { ok:false, code:'forbidden', reason:'Another Finance reviewer or Owner must review your payroll.' }
    const proposal=get().payrollProposals.find((item)=>item.employeePayrollIds.includes(draft.id)&&['submitted_to_finance','returned_to_hr'].includes(item.status))
    if (!proposal) return { ok:false, code:'invalid_status', reason:'This employee payroll is not inside an active proposal.' }
    const now=new Date().toISOString()
    const review:PayrollReviewRecord={id:`payroll-review-${Date.now()}`,payrollDraftId:draft.id,payrollPeriodId:draft.payrollPeriodId,employeeId:draft.employeeId,decision:'rejected',note:normalizedNote,actorName:actor.name,actorRole:actor.role,createdAt:now}
    set((state)=>({
      employeePayrolls:state.employeePayrolls.map((item)=>item.id===draft.id?{...item,status:'finance_rejected',rejectionReason:normalizedNote,financeReviewedAt:now,financeReviewedBy:actor.name}:item),
      payrollProposals:state.payrollProposals.map((item)=>item.id===proposal.id?{...item,status:'returned_to_hr',financeNote:`${draft.employeeName}: ${normalizedNote}`,financeDecisionAt:now,financeDecisionBy:actor.name}:item),
      payrollReviews:[...state.payrollReviews,review],
    }))
    return {ok:true,draftId:draft.id,proposalId:proposal.id}
  },

  adjustPayrollSchedule: ({ payrollPeriodId, proposed, reason, actor, now = new Date() }) => {
    if (!['finance','owner'].includes(actor.role)) return { ok:false, code:'forbidden', reason:'Only Finance or Owner can adjust a payroll schedule.' }
    const normalizedReason = reason.trim()
    const period = get().periods.find((item) => item.id === payrollPeriodId)
    if (!period) return { ok:false, code:'not_found', reason:'Payroll period was not found.' }
    const terminalProposal = get().payrollProposals.find((item) => item.payrollPeriodId === payrollPeriodId && ['finance_approved','paid'].includes(item.status))
    const terminalPayroll = get().employeePayrolls.some((item) => item.payrollPeriodId === payrollPeriodId && ['finance_verified','paid'].includes(item.status))
    if (terminalProposal || terminalPayroll) return { ok:false, code:'invalid_status', reason:'Approved or paid payroll schedules are immutable. Create a separate amendment instead.' }
    const validation = validatePayrollScheduleSnapshot(proposed)
    if (!validation.ok) return { ok:false, code:'invalid_schedule', reason:validation.reason, fieldErrors:validation.fieldErrors as Record<string,string> }
    const overlaps = get().periods.some((item) => item.id !== payrollPeriodId && payrollPeriodsOverlap(proposed, item))
    if (overlaps) return { ok:false, code:'overlapping_period', reason:'The adjusted earning period overlaps another payroll period.' }
    const drafts = get().employeePayrolls.filter((item) => item.payrollPeriodId === payrollPeriodId)
    const hasSubmittedPayrolls = drafts.some((item) => item.status !== 'draft')
    const hasVerifiedPayrolls = drafts.some((item) => ['finance_verified','paid','resolved'].includes(item.status))
    const timezone = useSettingsStore.getState().payroll.timezone
    const impact = evaluatePayrollScheduleAdjustment({ current:period, proposed, today:localToday(now, timezone), hasSubmittedPayrolls, hasVerifiedPayrolls })
    const createdAt = now.toISOString()
    const adjustment:PayrollScheduleAdjustmentRecord = {
      id:`payroll-adjustment-${Date.now()}`, payrollPeriodId,
      previousValues:{ periodStart:period.periodStart, periodEnd:period.periodEnd, hrSubmissionDeadline:period.hrSubmissionDeadline, financeReviewDeadline:period.financeReviewDeadline, paymentDate:period.paymentDate },
      newValues:proposed, reason:normalizedReason || 'Direct schedule edit', status:'applied', impactReasons:impact.reasons,
      changedBy:actor.name, changedByRole:actor.role, changedAt:createdAt,
      ...(actor.role === 'owner' ? { approvedBy:actor.name, approvedAt:createdAt } : {}),
    }
    set((state) => ({
      payrollScheduleAdjustments:[...state.payrollScheduleAdjustments, adjustment],
      periods:state.periods.map((item) => item.id === payrollPeriodId ? { ...item, ...proposed, status:getPayrollScheduleStage(proposed, localToday(now, timezone)), source:'finance_adjustment', lastAdjustedAt:createdAt, lastAdjustedBy:actor.name } : item),
    }))
    return { ok:true, adjustmentId:adjustment.id, status:adjustment.status }
  },

}))
