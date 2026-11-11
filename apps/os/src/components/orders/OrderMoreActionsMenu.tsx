import { useState, type FC } from 'react'
import { Flag, MoreVertical, Pencil, RotateCcw, XCircle } from 'lucide-react'
import { useBilingualCopy } from '../../i18n/bilingualCopy'
import { canReportOrderIssue } from '../../domain/orderIssueDomain'
import { ReportOrderIssueDialog } from './ReportOrderIssueDialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu'
import type { OrderDetailsViewModel } from './OrderDetailsController'

/** Whether the order window has anything to put in the "more actions" menu. */
export const hasOrderMoreActions = (viewModel: OrderDetailsViewModel): boolean => {
  const { order, canEdit, canRequestChange, canManageRefund, isEditing, currentUserRole } = viewModel
  return !isEditing && (canEdit || canRequestChange || (canManageRefund && order.paymentStatus === 'paid') || canReportOrderIssue(currentUserRole))
}

/** Refund, edit, cancel and change requests: the less frequent order actions. */
export const OrderMoreActionsMenu: FC<{ viewModel: OrderDetailsViewModel }> = ({ viewModel }) => {
  const {
    order,
    canEdit,
    canRequestChange,
    hasPendingRequest,
    setIsEditing,
    isCancellable,
    onCancelOrder,
    onOpenRequestModal,
    canManageRefund,
    onOpenInitiateRefund,
    currentUserRole,
  } = viewModel
  const tr = useBilingualCopy()
  const [reportOpen, setReportOpen] = useState(false)
  const canInitiateRefund = canManageRefund && order.paymentStatus === 'paid'

  return (
    <>
<DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-transparent text-muted-foreground transition hover:bg-muted/70 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
            aria-label="More order actions"
          >
            <MoreVertical className="size-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {canInitiateRefund && (
            <DropdownMenuItem onClick={onOpenInitiateRefund}>
              <RotateCcw className="size-3.5" />
              Initiate refund
            </DropdownMenuItem>
          )}
          {canEdit && (
            <DropdownMenuItem onClick={() => setIsEditing(true)}>
              <Pencil className="size-3.5" />
              Edit details
            </DropdownMenuItem>
          )}
          {canEdit && isCancellable && (
            <DropdownMenuItem
              onClick={onCancelOrder}
              className="text-destructive focus:text-destructive"
            >
              <XCircle className="size-3.5" />
              Cancel order
            </DropdownMenuItem>
          )}
          {canRequestChange && !hasPendingRequest && (
            <DropdownMenuItem onClick={() => onOpenRequestModal('edit')}>
              <Pencil className="size-3.5" />
              Request edit
            </DropdownMenuItem>
          )}
          {canRequestChange && isCancellable && !hasPendingRequest && (
            <DropdownMenuItem
              onClick={() => onOpenRequestModal('cancel')}
              className="text-destructive focus:text-destructive"
            >
              <XCircle className="size-3.5" />
              Request cancellation
            </DropdownMenuItem>
          )}
          {canReportOrderIssue(currentUserRole) && (
            <DropdownMenuItem onClick={() => setReportOpen(true)}>
              <Flag className="size-3.5" />
              {tr('Report an issue', 'Laporkan kendala')}
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      {order.id && <ReportOrderIssueDialog open={reportOpen} orderId={order.id} orderNumber={order.orderNumber ?? order.id} onClose={() => setReportOpen(false)} />}
    </>
  )
}
