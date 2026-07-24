import type { EmployeePayrollStatus, PayrollProposalStatus } from '../../store/payrollStore'
import { cn } from '../../lib/utils'

export type PayrollVisualStatus =
  | EmployeePayrollStatus
  | PayrollProposalStatus
  | 'needs_attention'
  | 'partially_approved'
  | 'ready_for_payment'

const STATUS_LABELS: Record<PayrollVisualStatus, string> = {
  draft: 'Draft',
  pending_finance_review: 'Pending Finance',
  finance_rejected: 'Returned to HR',
  finance_verified: 'Finance approved',
  paid: 'Paid',
  resolved: 'Resolved',
  submitted_to_finance: 'Finance review in progress',
  returned_to_hr: 'Returned to HR',
  finance_approved: 'Ready for payment',
  needs_attention: 'Needs attention',
  partially_approved: 'Partially approved',
  ready_for_payment: 'Ready for payment',
}

const STATUS_CLASSES: Record<PayrollVisualStatus, string> = {
  draft: 'bg-muted text-muted-foreground ring-border/70',
  pending_finance_review: 'bg-info/10 text-info ring-info/20',
  finance_rejected: 'bg-destructive/10 text-destructive ring-destructive/20',
  finance_verified: 'bg-success/10 text-success ring-success/20',
  paid: 'bg-success/10 text-success ring-success/20',
  resolved: 'bg-muted text-muted-foreground ring-border/70',
  submitted_to_finance: 'bg-info/10 text-info ring-info/20',
  returned_to_hr: 'bg-destructive/10 text-destructive ring-destructive/20',
  finance_approved: 'bg-success/10 text-success ring-success/20',
  needs_attention: 'bg-warning/10 text-warning ring-warning/20',
  partially_approved: 'bg-info/10 text-info ring-info/20',
  ready_for_payment: 'bg-success/10 text-success ring-success/20',
}

export const payrollStatusLabel = (status: PayrollVisualStatus): string => STATUS_LABELS[status]

export const PayrollStatusBadge = ({
  status,
  label,
  className,
}: {
  status: PayrollVisualStatus
  label?: string
  className?: string
}) => (
  <span
    className={cn(
      'inline-flex h-6 shrink-0 items-center rounded-full px-2.5 text-xs font-semibold ring-1',
      STATUS_CLASSES[status],
      className,
    )}
  >
    {label ?? STATUS_LABELS[status]}
  </span>
)
