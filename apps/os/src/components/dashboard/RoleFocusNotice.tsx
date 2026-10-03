/**
 * @file RoleFocusNotice.tsx
 * @description Explains to Finance and HR users why their Dashboard tab
 * looks narrower than Admin/Owner's (operational controls are intentionally
 * hidden for these roles). Renders nothing for any other role.
 */

import type { FC } from 'react'
import type { UserRole } from '../../store/userStore'
import { useOrdersStore } from '../../store/ordersStore'
import { useFinanceStore } from '../../store/financeStore'
import { usePayrollStore } from '../../store/payrollStore'
import { useHrStore } from '../../store/hrStore'
import { countOrdersAwaitingReconciliation, getFinanceAttention } from '../../domain/financeAttentionDomain'
import { surfaceCardClass } from '../ui/card'

export interface RoleFocusNoticeProps {
  userRole: UserRole
  /** Opens the Finance reconciliation queue the card counts. */
  onOpenReconciliation?: () => void
}

export const RoleFocusNotice: FC<RoleFocusNoticeProps> = ({ userRole, onOpenReconciliation }) => {
  const orders = useOrdersStore((state) => state.orders)
  const transactions = useFinanceStore((state) => state.transactions)
  const payrollProposals = usePayrollStore((state) => state.payrollProposals)
  const attendance = useHrStore((state) => state.attendance)
  // Same selector as the Finance overview, so the two numbers always match.
  const awaitingReconciliation = countOrdersAwaitingReconciliation(
    getFinanceAttention({ orders, transactions, payrollProposals }),
  )
  const attendanceExceptions = attendance.filter((record) => record.checkInLocation?.reviewStatus === 'pending_review' || record.checkOutLocation?.reviewStatus === 'pending_review').length
  if (userRole === 'finance') {
    return (
      <section className={surfaceCardClass('standard')}>
        <p className="text-xs font-semibold text-muted-foreground">Finance focus</p>
        <p className="mt-1 text-2xl font-semibold text-foreground">{awaitingReconciliation}</p>
        <p className="text-sm text-muted-foreground">orders waiting for reconciliation</p>
        {onOpenReconciliation && (
          <button
            type="button"
            onClick={onOpenReconciliation}
            className="mt-3 inline-flex h-11 items-center rounded-full bg-primary px-[18px] text-sm font-semibold text-primary-foreground shadow-ios-sm transition hover:bg-primary/90"
          >
            Open reconciliation
          </button>
        )}
      </section>
    )
  }

  if (userRole === 'hr') {
    return (
      <section className="space-y-3 rounded-xs bg-card p-4 ring-1 ring-border/60">
        <h2 className="text-xs font-semibold text-muted-foreground">
          HR focus
        </h2>
        <p className="text-sm text-muted-foreground">
          <span className="block text-2xl font-semibold text-foreground">{attendanceExceptions}</span>
          <span>attendance exceptions waiting for HR review</span>
        </p>
      </section>
    )
  }

  return null
}
