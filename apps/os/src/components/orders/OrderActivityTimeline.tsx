/**
 * @file OrderActivityTimeline.tsx
 * @description Compact historical timeline for Order Details activity.
 */

import type { FC } from 'react'
import type { OrderFulfillment, OrderStatus, OrderTableRow } from '../../types/orders'
import type { OrderActivityEvent } from '../../store/orderRuntimeStore'
import { isTerminalIssueOrder, isWorkflowHappyPathStatus } from '../../domain/orderBusinessRules'
import { STATUS_LABELS, STATUS_STAGE_STYLE, getOrderStatusOptionsForFulfillment } from './orderTableLabels'

export interface OrderActivityTimelineProps {
  order: OrderTableRow
  fulfillment: OrderFulfillment
  isOrderFuture: boolean
  activities: OrderActivityEvent[]
}

const formatActivityTime = (event: OrderActivityEvent): string => {
  const date = new Date(event.at)
  return date.toLocaleString('id-ID', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export const OrderActivityTimeline: FC<OrderActivityTimelineProps> = ({
  order,
  fulfillment,
  isOrderFuture,
  activities,
}) => {
  const isTerminalIssue = isTerminalIssueOrder(order)
  const statusOptions = getOrderStatusOptionsForFulfillment(fulfillment, isOrderFuture)
  const pipelineIds: OrderStatus[] = statusOptions
    .map((option) => option.id)
    .filter(isWorkflowHappyPathStatus)

  const currentIndex = isTerminalIssue ? pipelineIds.length : pipelineIds.indexOf(order.status)

  const findActivityFor = (statusId: OrderStatus) =>
    activities.find((event) =>
      event.description.toLowerCase().includes(STATUS_LABELS[statusId].toLowerCase()),
    )

  const rows = pipelineIds
    .map((id, index) => {
      const state: 'done' | 'current' | 'upcoming' =
        index < currentIndex ? 'done' : index === currentIndex ? 'current' : 'upcoming'
      const matchedActivity = findActivityFor(id)

      let timeLabel: string | null = null
      let actorLabel: string | null = null
      if (index === 0 && !matchedActivity) {
        timeLabel = order.createdAtLabel
        actorLabel = 'System'
      } else if (matchedActivity) {
        timeLabel = formatActivityTime(matchedActivity)
        actorLabel = matchedActivity.actor
      }

      return { id, state, timeLabel, actorLabel }
    })
    // Activity is history, not a second progress component. Upcoming stages stay
    // in the header progress indicator and are intentionally omitted here.
    .filter((row) => row.state !== 'upcoming')

  if (isTerminalIssue) {
    const lastActivity = activities[activities.length - 1]
    rows.push({
      id: order.status,
      state: 'current',
      timeLabel: lastActivity ? formatActivityTime(lastActivity) : null,
      actorLabel: lastActivity?.actor ?? null,
    })
  }

  const getLabel = (statusId: OrderStatus): string =>
    statusOptions.find((option) => option.id === statusId)?.label
      ?? STATUS_LABELS[statusId]
      ?? statusId

  return (
    <section className="max-w-2xl py-1">
      <p className="text-sm font-semibold leading-5 text-foreground">Activity timeline</p>
      <div className="mt-4">
        {rows.map((row, index) => {
          const style = STATUS_STAGE_STYLE[row.id]
          const isLast = index === rows.length - 1
          return (
            <div key={`${row.id}-${index}`} className="relative grid grid-cols-[14px_minmax(0,1fr)] gap-3 pb-4 last:pb-0">
              <div className="relative flex justify-center">
                <span
                  className={
                    row.state === 'current'
                      ? `relative z-10 mt-1 size-2.5 rounded-full ring-4 ring-card ${style.currentDot}${style.pulse ? ' animate-pulse motion-reduce:animate-none' : ''}`
                      : `relative z-10 mt-1 size-2.5 rounded-full ring-4 ring-card ${style.doneDot}`
                  }
                />
                {!isLast && (
                  <span className="absolute left-1/2 top-3.5 h-[calc(100%+0.1rem)] w-px -translate-x-1/2 bg-border/65" aria-hidden="true" />
                )}
              </div>

              <div className="min-w-0">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <p
                    className={
                      row.state === 'current'
                        ? `text-sm font-semibold leading-5 ${style.currentText}`
                        : 'text-sm font-medium leading-5 text-foreground'
                    }
                  >
                    {getLabel(row.id)}
                  </p>
                  {row.state === 'current' && (
                    <span className="rounded-full bg-primary/8 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.05em] text-primary">
                      Now
                    </span>
                  )}
                </div>
                {(row.timeLabel || row.actorLabel) && (
                  <p className="mt-0.5 truncate text-xs leading-4 text-muted-foreground">
                    {row.timeLabel}{row.actorLabel ? ` · ${row.actorLabel}` : ''}
                  </p>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

export default OrderActivityTimeline
