/**
 * @file OrderActivityTimeline.tsx
 * @description Vertical Activity timeline section of OrderDetailsPanel:
 * shows every pipeline stage as a connected stepper (a single line runs
 * through every event), with the current stage highlighted in its stage
 * color so it's clear where the order stands right now, rather than a
 * flat, undifferentiated list. Best-effort matches recorded activity
 * events to each stage by description text, falling back to the order's
 * creation event for the first stage and an "Expected …" scheduled-time
 * label for the final upcoming stage.
 */

import type { FC } from 'react'
import type { OrderFulfillment, OrderStatus, OrderTableRow } from '../../types/orders'
import type { OrderActivityEvent } from '../../store/orderRuntimeStore'
import { isTerminalIssueOrder, isWorkflowHappyPathStatus } from '../../domain/orderBusinessRules'
import { STATUS_LABELS, STATUS_STAGE_STYLE, getOrderStatusOptionsForFulfillment } from './orderTableLabels'
import { getDisplayScheduleLabel } from './orderTableFormatters'

export interface OrderActivityTimelineProps {
  order: OrderTableRow
  fulfillment: OrderFulfillment
  isOrderFuture: boolean
  activities: OrderActivityEvent[]
}

/**
 * @description Formats an activity timestamp for timeline display.
 */
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

  // Full pipeline for this order's fulfillment type (pending → confirmed →
  // processing → ready/delivering → delivered/picked up), excluding the
  // cancelled/failed branch so the happy path reads as a clean sequence of
  // stages.
  const pipelineIds: OrderStatus[] = getOrderStatusOptionsForFulfillment(fulfillment, isOrderFuture)
    .map((option) => option.id)
    .filter(isWorkflowHappyPathStatus)

  const currentIndex = isTerminalIssue ? pipelineIds.length : pipelineIds.indexOf(order.status)
  const finalStageId = pipelineIds[pipelineIds.length - 1]

  // Best-effort match of a recorded activity to a given stage, so completed
  // stages can show who did it and when instead of just a label.
  const findActivityFor = (statusId: OrderStatus) =>
    activities.find((event) =>
      event.description.toLowerCase().includes(STATUS_LABELS[statusId].toLowerCase()),
    )

  const rows = pipelineIds.map((id, index) => {
    const state: 'done' | 'current' | 'upcoming' =
      index < currentIndex ? 'done' : index === currentIndex ? 'current' : 'upcoming'

    const matchedActivity = findActivityFor(id)
    let timeLabel: string | null = null
    let actorLabel: string | null = null

    if (index === 0 && !matchedActivity) {
      // First stage with no explicit activity logged yet falls back to the
      // order's creation event.
      timeLabel = order.createdAtLabel
      actorLabel = 'System'
    } else if (matchedActivity) {
      timeLabel = formatActivityTime(matchedActivity)
      actorLabel = matchedActivity.actor
    } else if (state === 'upcoming' && id === finalStageId) {
      // Nothing's happened yet, but we do know when it's expected — show
      // that instead of leaving it blank.
      const eta = getDisplayScheduleLabel(order)
      timeLabel = eta ? `Expected ${eta}` : null
    }

    return { id, state, timeLabel, actorLabel }
  })

  if (isTerminalIssue) {
    const lastActivity = activities[activities.length - 1]
    rows.push({
      id: order.status,
      state: 'current',
      timeLabel: lastActivity ? formatActivityTime(lastActivity) : null,
      actorLabel: lastActivity?.actor ?? null,
    })
  }

  const lastIndex = rows.length - 1

  return (
    <section className="space-y-1 rounded-xl bg-card px-3 py-3 ring-1 ring-border/70">
      <p className="text-sm font-semibold leading-5 text-foreground">Activity timeline</p>
      <div className="mt-2">
        {rows.map((row, index) => (
          <div key={row.id} className="relative flex gap-3 pb-3.5 last:pb-0">
            {/* Connecting line + dot */}
            <div className="relative flex w-4 shrink-0 flex-col items-center">
              <span
                className={
                  row.state === 'current'
                    ? `z-10 mt-0.5 flex size-3.5 shrink-0 rounded-full ${STATUS_STAGE_STYLE[row.id as OrderStatus].currentDot}${STATUS_STAGE_STYLE[row.id as OrderStatus].pulse ? ' animate-pulse' : ''}`
                    : row.state === 'done'
                      ? `z-10 mt-0.5 flex size-3.5 shrink-0 rounded-full ${STATUS_STAGE_STYLE[row.id as OrderStatus].doneDot}`
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
            {/* min-h reserves room for a stage's optional expanded detail
                (e.g. a note or address) without breaking the line rhythm
                above/below it once that's added. */}
            <div className="min-h-[1.75rem] min-w-0 flex-1 space-y-0.5">
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
                    ? `flex items-center gap-2 text-sm font-semibold ${STATUS_STAGE_STYLE[row.id as OrderStatus].currentText}`
                    : row.state === 'done'
                      ? 'text-sm font-medium text-foreground'
                      : 'text-sm font-medium text-muted-foreground'
                }
              >
                {pipelineIds[index] &&
                  getOrderStatusOptionsForFulfillment(fulfillment, isOrderFuture).find(
                    (option) => option.id === row.id,
                  )?.label}
                {row.state === 'current' && (
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold uppercase tracking-[0.06em] text-primary">
                    Now
                  </span>
                )}
              </p>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

export default OrderActivityTimeline
