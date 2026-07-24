import type { FC } from 'react'
import { AlertTriangle, Eye } from 'lucide-react'
import { Checkbox } from '../ui/checkbox'
import { formatIdrCurrency } from '../../lib/formatters'
import { parseOrderDate } from '../../domain/revenueDateDomain'
import type {
  FinanceQueueRow,
  OrderTransactionVerificationQueueViewModel,
} from './OrderTransactionVerificationQueueController'

/**
 * @description Compact, task-focused row for Finance order verification.
 * The order identity opens the read-only review sheet, Verify is the single
 * visible primary action, and uncommon exception actions are progressively
 * disclosed under More actions.
 */
type QueueRowActionProps = Pick<
  OrderTransactionVerificationQueueViewModel,
  | 'canVerify'
  | 'isBulkSelectMode'
  | 'verificationActionType'
  | 'verificationActionNote'
  | 'onSelectOrder'
  | 'onToggleOrderSelected'
  | 'onOpenVerificationAction'
  | 'onVerificationActionNoteChange'
  | 'onCloseVerificationAction'
  | 'onConfirmVerificationAction'
  | 'onVerifyOrder'
>

interface OrderVerificationQueueRowProps extends QueueRowActionProps {
  row: FinanceQueueRow
}

const waitingAgeLabel = (createdAtLabel: string) => {
  const createdAt = parseOrderDate(createdAtLabel)
  if (!createdAt) return null
  const minutes = Math.max(0, Math.floor((Date.now() - createdAt.getTime()) / 60_000))
  if (minutes < 60) return `Waiting ${Math.max(1, minutes)} min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `Waiting ${hours} hr${hours === 1 ? '' : 's'}`
  const days = Math.floor(hours / 24)
  return `Waiting ${days} day${days === 1 ? '' : 's'}`
}

export const OrderVerificationQueueRow: FC<OrderVerificationQueueRowProps> = ({
  row,
  canVerify,
  isBulkSelectMode,
  verificationActionNote,
  onSelectOrder,
  onToggleOrderSelected,
  onOpenVerificationAction,
  onVerificationActionNoteChange,
  onCloseVerificationAction,
  onConfirmVerificationAction,
  onVerifyOrder,
}) => {
  const { order, isEnteringNote, isMarkedForReview, isPending, isRejected, isVerified, isSelected } =
    row

  const statusText = isVerified
    ? `Verified${order.financeVerifiedBy ? ` by ${order.financeVerifiedBy}` : ''}`
    : isRejected
      ? `Rejected${order.financeVerificationActor ? ` by ${order.financeVerificationActor}` : ''}`
      : isMarkedForReview
        ? `Needs attention${order.financeVerificationActor ? ` · flagged by ${order.financeVerificationActor}` : ''}`
        : 'Ready to verify'

  const waitingAge = isPending ? waitingAgeLabel(order.createdAtLabel) : null

  const statusClass = isVerified
    ? 'text-success'
    : isRejected
      ? 'text-destructive'
      : isMarkedForReview
        ? 'text-warning'
        : 'text-muted-foreground'

  return (
    <article
      className={`space-y-2 rounded-xl bg-surface-card px-3.5 py-3 shadow-ios-sm ring-1 transition ${
        isRejected
          ? 'ring-destructive/30'
          : isMarkedForReview
            ? 'ring-warning/40'
            : 'ring-border/60'
      }`}
    >
      <div className="flex items-start gap-2.5">
        {isPending && canVerify && isBulkSelectMode && (
          <div className="mt-1">
            <Checkbox
              checked={isSelected}
              onCheckedChange={(checked) =>
                onToggleOrderSelected(order.orderNumber, checked === true)
              }
              aria-label={`Select order ${order.orderNumber} for bulk verify`}
            />
          </div>
        )}

        <button
          type="button"
          onClick={() => onSelectOrder(order)}
          className="min-w-0 flex-1 rounded-lg text-left outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
          aria-label={`Review order ${order.orderNumber} from ${order.customerName}`}
        >
          <span className="block">
            <span className="flex items-start justify-between gap-3">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-base font-semibold leading-tight text-foreground">
                  {order.customerName}
                </span>
                <span className="mt-1 block truncate text-2xs font-medium text-muted-foreground">
                  {order.orderNumber} · {order.branch}
                </span>
                <span className="mt-0.5 block text-2xs text-muted-foreground">
                  {order.createdAtLabel}{waitingAge ? ` · ${waitingAge}` : ''}
                </span>
              </span>
              <span className="shrink-0 text-right">
                <span className="block text-sm font-semibold text-foreground">
                  {formatIdrCurrency(order.totalIdr)}
                </span>
              </span>
            </span>
            <span className="mt-2 flex items-center justify-between gap-3">
              <span className={`text-2xs font-medium ${statusClass}`}>
                {statusText}
              </span>
              <span className="inline-flex items-center gap-1 text-2xs font-medium text-primary">
                <Eye className="size-3" />
                Review
              </span>
            </span>
          </span>
        </button>
      </div>

      {isPending && canVerify && !isEnteringNote && !isBulkSelectMode && (
        <div className="flex items-center justify-end gap-2 border-t border-border/60 pt-2">
          <button type="button" onClick={() => onOpenVerificationAction(order.orderNumber, 'correction')} className="inline-flex h-11 items-center gap-2 rounded-full border border-warning/30 bg-warning/5 px-[18px] text-sm font-medium text-warning"><AlertTriangle className="size-4"/>Needs correction</button>
          <button
            type="button"
            aria-label="Verify"
            onClick={() => onVerifyOrder(order.orderNumber)}
            className="h-11 cursor-pointer rounded-full bg-success px-[18px] text-sm font-semibold text-success-foreground shadow-ios-sm hover:bg-success/90"
          >
            Verify payment
          </button>
        </div>
      )}

      {isEnteringNote && (
        <div className="space-y-2 border-t border-border/60 pt-2">
          <div>
            <label className="text-xs font-medium text-foreground" htmlFor={`finance-note-${order.orderNumber}`}>
              Correction reason · Required
            </label>
            <p className="text-2xs text-muted-foreground">
              Explain what must be corrected before Finance can verify the order.
            </p>
          </div>
          <input
            id={`finance-note-${order.orderNumber}`}
            type="text"
            value={verificationActionNote}
            onChange={(event) => onVerificationActionNoteChange(event.target.value)}
            placeholder={
              'Enter correction reason'
            }
            className="h-9 w-full rounded-lg border border-border bg-surface-card px-3 text-xs text-foreground outline-none placeholder:text-muted-foreground focus:border-primary/50 focus:ring-2 focus:ring-primary/30 dark:focus:ring-primary/40"
          />
          <div className="flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              onClick={onCloseVerificationAction}
              className="cursor-pointer rounded-full text-xs font-medium text-muted-foreground hover:bg-muted rounded-full px-[18px] whitespace-nowrap h-11 rounded-full px-[18px] gap-2 whitespace-nowrap"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => onConfirmVerificationAction(order.orderNumber)}
              className="h-11 cursor-pointer rounded-full bg-warning px-[18px] text-sm font-semibold text-warning-foreground shadow-ios-sm"
            >
              Send correction request
            </button>
          </div>
        </div>
      )}
    </article>
  )
}
