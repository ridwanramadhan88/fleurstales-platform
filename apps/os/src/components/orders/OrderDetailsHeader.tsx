import type { FC } from 'react'
import { MoreVertical, Pencil, RotateCcw, ShieldCheck, X, XCircle } from 'lucide-react'
import { StatusChip } from '../ui/chip'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu'
import {
  STATUS_GROUP_FROM_STATUS,
  URGENCY_CHIP,
} from './orderTableLabels'
import { getDisplayScheduleLabel } from './orderTableFormatters'
import type { OrderDetailsViewModel } from './OrderDetailsController'

interface OrderDetailsHeaderProps {
  viewModel: OrderDetailsViewModel
}

export const OrderDetailsHeader: FC<OrderDetailsHeaderProps> = ({ viewModel }) => {
  const {
    order,
    onClose,
    productDisplay,
    urgency,
    canEdit,
    canVerify,
    canVerifyThisOrder,
    canRequestChange,
    hasPendingRequest,
    locked,
    currentUserRole,
    isEditing,
    setIsEditing,
    draft,
    isCancellable,
    onDraftChange,
    onCancelOrder,
    onVerifyOrder,
    onOpenRequestModal,
    canManageRefund,
    onOpenInitiateRefund,
  } = viewModel

  const canInitiateRefund = canManageRefund && order.paymentStatus === 'paid'
  const hasMenuActions =
    !isEditing &&
    (canVerifyThisOrder || canEdit || canRequestChange || canInitiateRefund)

  return (
    <header className="mb-4">
      <div className="flex min-h-10 items-center justify-between gap-3">
        <p className="shrink-0 text-2xs font-semibold text-muted-foreground">
          Order
        </p>

        <div className="flex min-w-0 items-center justify-end gap-2">
          {locked && !order.financeVerified && (
            <span className="inline-flex max-w-[12rem] shrink items-center truncate rounded-full bg-warning/10 px-2.5 py-1 text-2xs font-semibold text-warning ring-1 ring-warning/20">
              {currentUserRole === 'admin' ? 'Sent to Payment Verification' : 'Awaiting Finance'}
            </span>
          )}

          <StatusChip
            tone={URGENCY_CHIP[urgency].tone}
            className="hidden shrink-0 whitespace-nowrap lg:inline-flex"
          >
            {getDisplayScheduleLabel(order) ?? URGENCY_CHIP[urgency].label}
          </StatusChip>

          {hasMenuActions && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-transparent text-muted-foreground transition hover:bg-muted/70 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
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
                {canVerifyThisOrder && (
                  <DropdownMenuItem onClick={onVerifyOrder}>
                    <ShieldCheck className="size-3.5" />
                    Verify order
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
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          {!isEditing && !canEdit && !canRequestChange && !canVerify && !canInitiateRefund && (
            <span className="hidden shrink-0 whitespace-nowrap rounded-full bg-surface-neutral px-3 py-1.5 text-xs font-medium text-foreground ring-1 ring-border/80 lg:inline-flex">
              View only
            </span>
          )}

          <button
            type="button"
            onClick={onClose}
            className="inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-transparent text-muted-foreground transition hover:bg-muted/70 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
            aria-label="Close"
          >
            <X className="size-4" />
          </button>
        </div>
      </div>

      <div className="mt-3 min-w-0 space-y-1.5">
        {!isEditing ? (
          <h2 className="flex min-w-0 items-center gap-2 text-lg font-semibold leading-6 text-foreground">
            {order.customerName}
            {STATUS_GROUP_FROM_STATUS[order.status] === 'new' && (
              <span className="inline-flex shrink-0 items-center rounded-full bg-primary/10 px-2 py-0.5 text-2xs font-semibold uppercase tracking-wide text-primary">
                New
              </span>
            )}
          </h2>
        ) : (
          <input
            type="text"
            value={draft.customerName}
            onChange={(event) => onDraftChange('customerName', event.target.value)}
            className="h-9 w-full max-w-xs rounded-sm border border-border bg-background px-3 text-lg font-semibold text-foreground outline-none placeholder:text-muted-foreground focus:border-primary/50 focus:ring-2 focus:ring-primary/30 dark:focus:ring-primary/40"
            placeholder="Customer name"
          />
        )}
        <p className="text-sm font-semibold leading-snug text-foreground sm:text-base">
          {productDisplay.name}
        </p>
        <p className="text-2xs text-muted-foreground">{order.orderNumber}</p>
        <p className="text-xs text-muted-foreground sm:text-sm">
          {order.branch} · {order.createdAtLabel}
        </p>
      </div>
    </header>
  )
}
