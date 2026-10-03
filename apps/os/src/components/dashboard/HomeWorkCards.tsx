/**
 * @file HomeWorkCards.tsx
 * @description The work waiting for Finance and HR, as cards on their home
 * screen. Each card opens the screen where that work is done.
 */

import type { FC, ReactNode } from 'react'
import { ArrowRight, CalendarDays, ClipboardCheck, RotateCcw, UserRoundCheck, Wallet, AlertTriangle } from 'lucide-react'
import { toFinanceModule, toHrSection, type AppNavigationRequest } from '../../config/appNavigation'
import { useOrdersStore } from '../../store/ordersStore'
import { useFinanceStore } from '../../store/financeStore'
import { usePayrollStore } from '../../store/payrollStore'
import { useHrStore, todayIsoDate } from '../../store/hrStore'
import { getFinanceAttention } from '../../domain/financeAttentionDomain'
import { getHrHomeWork } from '../../domain/homeWorkDomain'
import { getMondayForDate, getWeekDates, toIsoDate } from '../../domain/hrSchedulingDomain'
import { requestFinanceWorkspaceNavigation } from '../finance/financeWorkspaceNavigation'
import { surfaceCardClass } from '../ui/card'

const WorkCard: FC<{ icon: ReactNode; label: string; value: string | number; helper: string; urgent: boolean; onOpen: () => void }> = ({ icon, label, value, helper, urgent, onOpen }) => (
  <button type="button" onClick={onOpen} className={`${surfaceCardClass('standard')} flex w-full flex-col gap-2 p-4 text-left transition hover:bg-accent/40`}>
    <span className="flex items-center justify-between gap-2">
      <span className={`flex size-9 items-center justify-center rounded-full ${urgent ? 'bg-warning/10 text-warning' : 'bg-muted text-muted-foreground'}`}>{icon}</span>
      <ArrowRight className="size-4 text-muted-foreground" />
    </span>
    <span className="text-2xl font-semibold tabular-nums text-foreground">{value}</span>
    <span className="text-sm font-semibold text-foreground">{label}</span>
    <span className="text-xs text-muted-foreground">{helper}</span>
  </button>
)

export const FinanceHomeWork: FC<{ onNavigate: (target: AppNavigationRequest) => void }> = ({ onNavigate }) => {
  const orders = useOrdersStore((state) => state.orders)
  const transactions = useFinanceStore((state) => state.transactions)
  const payrollProposals = usePayrollStore((state) => state.payrollProposals)
  const attention = getFinanceAttention({ orders, transactions, payrollProposals })
  const open = (target: Parameters<typeof requestFinanceWorkspaceNavigation>[0]) => {
    onNavigate(toFinanceModule(target.module))
    requestFinanceWorkspaceNavigation(target)
  }
  return (
    <section aria-label="Finance work" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <WorkCard icon={<ClipboardCheck className="size-4" />} value={attention.awaiting} label="Awaiting reconciliation" helper="Paid orders to check" urgent={attention.awaiting > 0} onOpen={() => open({ module: 'order_verification', view: 'all' })} />
      <WorkCard icon={<AlertTriangle className="size-4" />} value={attention.correction} label="Needs correction" helper="Sent back to Admin" urgent={attention.correction > 0} onOpen={() => open({ module: 'order_verification', view: 'needs_correction' })} />
      <WorkCard icon={<RotateCcw className="size-4" />} value={attention.refunds} label="Refunds" helper="Waiting to be paid back" urgent={attention.refunds > 0} onOpen={() => open({ module: 'refunds', view: 'pending' })} />
      <WorkCard icon={<Wallet className="size-4" />} value={attention.payrollReview + attention.payrollReady} label="Payroll" helper="To review or pay" urgent={attention.payrollReview + attention.payrollReady > 0} onOpen={() => open({ module: 'payroll', view: attention.payrollReview > 0 ? 'review' : 'ready' })} />
    </section>
  )
}

const PAYROLL_STATUS_LABEL: Record<string, string> = {
  draft: 'Draft',
  submitted_to_finance: 'Finance review in progress',
  returned_to_hr: 'Returned to HR',
  finance_approved: 'Ready for payment',
  paid: 'Payment recorded',
  resolved: 'Resolved',
}

export const HrHomeWork: FC<{ onNavigate: (target: AppNavigationRequest) => void }> = ({ onNavigate }) => {
  const reviewCases = useHrStore((state) => state.attendanceReviewCases)
  const employees = useHrStore((state) => state.employees)
  const overrides = useHrStore((state) => state.scheduleOverrides)
  const payrollProposals = usePayrollStore((state) => state.payrollProposals)
  const weekDates = getWeekDates(toIsoDate(getMondayForDate(todayIsoDate())))
  const work = getHrHomeWork({ reviewCases: reviewCases ?? [], employees, overrides, weekDates, payrollProposals })
  return (
    <section aria-label="HR work" className="grid grid-cols-2 gap-3 lg:grid-cols-3">
      <WorkCard icon={<UserRoundCheck className="size-4" />} value={work.attendanceToReview} label="Attendance to review" helper="Open attendance cases" urgent={work.attendanceToReview > 0} onOpen={() => onNavigate(toHrSection('attendance'))} />
      <WorkCard icon={<CalendarDays className="size-4" />} value={work.unscheduledStaff} label="Staff without a schedule" helper="Missing days this week" urgent={work.unscheduledStaff > 0} onOpen={() => onNavigate(toHrSection('scheduling'))} />
      <WorkCard icon={<Wallet className="size-4" />} value={work.payrollStatus ? PAYROLL_STATUS_LABEL[work.payrollStatus] : 'Not created'} label="Payroll" helper="This period" urgent={work.payrollStatus === null || work.payrollStatus === 'returned_to_hr' || work.payrollStatus === 'draft'} onOpen={() => onNavigate(toHrSection('payroll'))} />
    </section>
  )
}
