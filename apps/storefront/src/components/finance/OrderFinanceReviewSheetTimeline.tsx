import type { FC } from 'react'
import { STATUS_STAGE_STYLE, getOrderStatusOptionsForFulfillment } from '../orders/orderTableLabels'
import type { OrderFinanceReviewSheetViewModel } from './OrderFinanceReviewSheetController'
import { StatusChip } from '../ui/chip'

/**
 * @description Vertical activity timeline (one row per fulfillment stage,
 * with timestamp/actor once reached). Split out of
 * `OrderFinanceReviewSheet.tsx`.
 */

type OrderFinanceReviewSheetTimelineProps = Pick<
  OrderFinanceReviewSheetViewModel,
  'order' | 'isOrderFuture' | 'timelineRows' | 'lastIndex'
>

export const OrderFinanceReviewSheetTimeline: FC<OrderFinanceReviewSheetTimelineProps> = ({
  order,
  isOrderFuture,
  timelineRows,
  lastIndex,
}) => {
  return (
    <section className="space-y-1 rounded-lg bg-card px-3 py-2 ring-1 ring-border sm:col-span-2">
      <p className="text-2xs font-semibold text-muted-foreground">Activity timeline</p>
      <div className="mt-2">
        {timelineRows.map((row, index) => (
          <div key={row.id} className="relative flex gap-3 pb-5 last:pb-0">
            <div className="relative flex w-4 shrink-0 flex-col items-center">
              <span
                className={
                  row.state === 'current'
                    ? `z-10 mt-0.5 flex size-3.5 shrink-0 rounded-full ${STATUS_STAGE_STYLE[row.id].currentDot}${STATUS_STAGE_STYLE[row.id].pulse ? ' animate-pulse' : ''}`
                    : row.state === 'done'
                      ? `z-10 mt-0.5 flex size-3.5 shrink-0 rounded-full ${STATUS_STAGE_STYLE[row.id].doneDot}`
                      : 'z-10 mt-0.5 flex size-3.5 shrink-0 rounded-full border-2 border-border bg-card'
                }
              />
              {index < lastIndex && (
                <span
                  className={
                    row.state === 'upcoming'
                      ? 'mt-1 w-px flex-1 bg-border/60'
                      : 'mt-1 w-px flex-1 bg-border'
                  }
                />
              )}
            </div>
            <div className="min-h-[2.25rem] min-w-0 flex-1 space-y-0.5">
              <p
                className={
                  row.state === 'upcoming'
                    ? 'text-xs text-muted-foreground'
                    : 'text-xs text-muted-foreground'
                }
              >
                {row.timeLabel
                  ? `${row.timeLabel}${row.actorLabel ? ` · ${row.actorLabel}` : ''}`
                  : '\u00A0'}
              </p>
              <p
                className={
                  row.state === 'current'
                    ? `flex items-center gap-2 text-sm font-semibold ${STATUS_STAGE_STYLE[row.id].currentText}`
                    : row.state === 'done'
                      ? 'text-sm font-medium text-foreground'
                      : 'text-sm font-medium text-muted-foreground'
                }
              >
                {getOrderStatusOptionsForFulfillment(order.fulfillment, isOrderFuture).find(
                  (option) => option.id === row.id,
                )?.label}
                {row.state === 'current' && (
                  <StatusChip tone="info" showDot={false} className="px-2 py-0.5 text-xs uppercase tracking-[0.06em]">Now</StatusChip>
                )}
              </p>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
