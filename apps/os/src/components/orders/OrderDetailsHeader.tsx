import type { FC, ReactNode } from 'react'
import { MoreVertical, Pencil, RotateCcw, X, XCircle } from 'lucide-react'
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
import { formatOrderCreatedAtLabel, getDisplayScheduleLabel } from './orderTableFormatters'
import type { OrderDetailsViewModel } from './OrderDetailsController'
import { InfoHint } from '../ui/info-hint'

interface OrderDetailsHeaderProps {
  viewModel: OrderDetailsViewModel
  progress?: ReactNode
}

export const OrderDetailsHeader: FC<OrderDetailsHeaderProps> = ({ viewModel, progress }) => {
  const {
    order,
    onClose,
    productDisplay,
    urgency,
    canEdit,
    canVerify,
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
    onOpenRequestModal,
    canManageRefund,
    onOpenInitiateRefund,
  } = viewModel

  const canInitiateRefund = canManageRefund && order.paymentStatus === 'paid'
  const hasMenuActions =
    !isEditing &&
    (canEdit || canRequestChange || canInitiateRefund)

  return (
    <header className="mb-2">
      <div className="flex min-h-9 items-center justify-between gap-3">
        <p className="shrink-0 text-2xs font-semibold text-muted-foreground">
          Order
        </p>

        <div className="flex min-w-0 items-center justify-end gap-1.5">
          {locked && !order.financeVerified && (
            <span className="inline-flex max-w-[12rem] shrink items-center truncate rounded-full bg-warning/10 px-2.5 py-1 text-2xs font-semibold text-warning ring-1 ring-warning/20">
              {currentUserRole === 'admin' ? 'Awaiting Finance Reconciliation' : 'Awaiting Finance'}
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
            className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-transparent text-muted-foreground transition hover:bg-muted/70 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
            aria-label="Close"
          >
            <X className="size-4" />
          </button>
        </div>
      </div>

      <div className={`mt-1.5 grid min-w-0 gap-2 ${progress ? 'lg:grid-cols-[minmax(0,0.85fr)_minmax(24rem,1.15fr)] lg:items-center lg:gap-5' : ''}`}>
        <div className="min-w-0 space-y-0.5">
          {!isEditing ? (
            <h2 className="flex min-w-0 items-center gap-2 text-lg font-semibold leading-6 text-foreground">
              <span className="truncate">{order.customerName}</span>
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
              className="h-10 w-full max-w-xs rounded-xl border border-border/70 bg-surface-panel px-3.5 text-base font-semibold text-foreground outline-none transition placeholder:font-normal placeholder:text-muted-foreground hover:border-border focus:border-primary/40 focus:ring-2 focus:ring-primary/25"
              placeholder="Customer name"
            />
          )}
          <p className="truncate text-sm font-semibold leading-5 text-foreground sm:text-base">
            {productDisplay.name}
          </p>
          <p className="flex min-w-0 items-center gap-1 text-2xs text-muted-foreground sm:text-xs">
            <span className="truncate">
              {order.orderNumber} · {order.branch} · {formatOrderCreatedAtLabel(order.createdAtLabel)}
            </span>
            <InfoHint label="Exact order timestamp" align="end">{order.createdAtLabel}</InfoHint>
          </p>
        </div>

        {progress && (
          <div className="min-w-0 pt-1 lg:pt-0">
            {progress}
          </div>
        )}
      </div>
    </header>
  )
}
