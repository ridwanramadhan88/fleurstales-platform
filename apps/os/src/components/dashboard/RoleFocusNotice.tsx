/**
 * @file RoleFocusNotice.tsx
 * @description Explains to Finance and HR users why their Dashboard tab
 * looks narrower than Admin/Owner's (operational controls are intentionally
 * hidden for these roles). Renders nothing for any other role.
 */

import type { FC } from 'react'
import type { UserRole } from '../../store/userStore'
import { useOrdersStore } from '../../store/ordersStore'
import { useHrStore } from '../../store/hrStore'
import { surfaceCardClass } from '../ui/card'

export interface RoleFocusNoticeProps {
  userRole: UserRole
}

export const RoleFocusNotice: FC<RoleFocusNoticeProps> = ({ userRole }) => {
  const orders = useOrdersStore((state) => state.orders)
  const attendance = useHrStore((state) => state.attendance)
  const pendingVerification = orders.filter((order) => order.status === 'pending_verification' && !order.financeVerified).length
  const attendanceExceptions = attendance.filter((record) => record.checkInLocation?.reviewStatus === 'pending_review' || record.checkOutLocation?.reviewStatus === 'pending_review').length
  if (userRole === 'finance') {
    return (
      <section className={surfaceCardClass('standard')}>
        <p className="text-xs font-semibold text-muted-foreground">Finance focus</p>
        <p className="mt-1 text-2xl font-semibold text-foreground">{pendingVerification}</p>
        <p className="text-sm text-muted-foreground">completed order{pendingVerification === 1 ? '' : 's'} waiting for payment verification.</p>
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
          attendance exception{attendanceExceptions === 1 ? '' : 's'} waiting for HR review.
        </p>
      </section>
    )
  }

  return null
}
