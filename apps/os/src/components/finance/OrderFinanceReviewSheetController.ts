import { useMemo, useState } from 'react'
import { useCatalogStore } from '../../store/catalogStore'
import {
  useOrderRuntimeStore,
  type OrderActivityEvent,
} from '../../store/orderRuntimeStore'
import { useOrdersStore } from '../../store/ordersStore'
import { useUserStore } from '../../store/userStore'
import { resolveOrderProductDisplay } from '../../domain/catalogDomain'
import {
  isPendingFinanceVerification,
  isMarkedForFinanceReview,
  isRejectedByFinance,
  isTerminalIssueOrder,
  isWorkflowHappyPathStatus,
} from '../../domain/orderBusinessRules'
import type { OrderStatus, OrderTableRow } from '../../types/orders'
import { useDismissableModal } from '../../hooks/useDismissableModal'
import { toast } from '../../hooks/use-toast'
import type { OrderFinanceReviewSheetProps } from './OrderFinanceReviewSheet'
import { STATUS_ICONS, STATUS_LABELS, getOrderStatusOptionsForFulfillment } from '../orders/orderTableLabels'
import { EMPTY_ACTIVITIES } from '../orders/orderTableSharedConstants'
import { getDisplayScheduleLabel, getOrderUrgency, isFutureOrder } from '../orders/orderTableFormatters'

export interface FinanceReviewTimelineRow {
  id: OrderStatus
  state: 'done' | 'current' | 'upcoming'
  timeLabel: string | null
  actorLabel: string | null
}

export interface OrderFinanceReviewSheetViewModel {
  order: OrderTableRow
  onClose: () => void
  canVerify: boolean
  productName: string
  activities: OrderActivityEvent[]
  actionType: 'correction' | null
  actionNote: string
  isOrderFuture: boolean
  urgency: ReturnType<typeof getOrderUrgency>
  StatusIcon: (typeof STATUS_ICONS)[OrderStatus]
  wasRejected: boolean
  isMarkedForReview: boolean
  isPending: boolean
  isTerminalIssue: boolean
  horizontalOptions: ReturnType<typeof getOrderStatusOptionsForFulfillment>
  horizontalCurrentIndex: number
  timelineRows: FinanceReviewTimelineRow[]
  lastIndex: number
  onActionNoteChange: (note: string) => void
  onCloseAction: () => void
  onStartAction: (type: 'correction') => void
  onConfirmAction: () => void
  onVerifyOrder: () => void
}

const formatActivityTime = (at: string): string => {
  const date = new Date(at)
  return date.toLocaleString('id-ID', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export const useOrderFinanceReviewSheetController = ({
  order,
  onClose,
  canVerify,
  actorName,
  userRole,
}: OrderFinanceReviewSheetProps): OrderFinanceReviewSheetViewModel => {
  const catalogProducts = useCatalogStore((state) => state.products)
  const productName = resolveOrderProductDisplay(catalogProducts, order).name
  const activities = useOrderRuntimeStore(
    (state) => state.activities[order.orderNumber] ?? EMPTY_ACTIVITIES,
  )
  const verifyOrderFinance = useOrdersStore((state) => state.verifyOrderFinance)
  const markOrderForFinanceReview = useOrdersStore(
    (state) => state.markOrderForFinanceReview,
  )
  const employeeId = useUserStore((state) => state.employeeId)
  const branchId = useUserStore((state) => state.branchId)
  const actor = { employeeId, name: actorName, role: userRole, branchId }

  const [actionType, setActionType] = useState<'correction' | null>(null)
  const [actionNote, setActionNote] = useState('')

  const closeAction = () => {
    setActionType(null)
    setActionNote('')
  }

  useDismissableModal(true, onClose)

  const isOrderFuture = isFutureOrder(order)
  const urgency = getOrderUrgency(order)
  const StatusIcon = STATUS_ICONS[order.status]
  const wasRejected = isRejectedByFinance(order)
  const isMarkedForReview = isMarkedForFinanceReview(order)
  const isPending = isPendingFinanceVerification(order)
  const isTerminalIssue = isTerminalIssueOrder(order)
  const horizontalOptions = getOrderStatusOptionsForFulfillment(
    order.fulfillment,
    isOrderFuture,
  ).filter((option) => isWorkflowHappyPathStatus(option.id))
  const horizontalCurrentIndex = isTerminalIssue
    ? horizontalOptions.length
    : horizontalOptions.findIndex((option) => option.id === order.status)

  const pipelineIds = useMemo(
    () =>
      getOrderStatusOptionsForFulfillment(order.fulfillment, isOrderFuture)
        .map((option) => option.id)
        .filter(isWorkflowHappyPathStatus),
    [order.fulfillment, isOrderFuture],
  )

  const timelineRows: FinanceReviewTimelineRow[] = pipelineIds.map((id, index) => {
    const currentIndex = isTerminalIssue
      ? pipelineIds.length
      : pipelineIds.indexOf(order.status as (typeof pipelineIds)[number])
    const finalStageId = pipelineIds[pipelineIds.length - 1]
    const state: 'done' | 'current' | 'upcoming' =
      index < currentIndex ? 'done' : index === currentIndex ? 'current' : 'upcoming'

    const matchedActivity = activities.find((event) =>
      event.description.toLowerCase().includes(STATUS_LABELS[id].toLowerCase()),
    )
    let timeLabel: string | null = null
    let actorLabel: string | null = null

    if (index === 0 && !matchedActivity) {
      timeLabel = order.createdAtLabel
      actorLabel = 'System'
    } else if (matchedActivity) {
      timeLabel = formatActivityTime(matchedActivity.at)
      actorLabel = matchedActivity.actor
    } else if (state === 'upcoming' && id === finalStageId) {
      const eta = getDisplayScheduleLabel(order)
      timeLabel = eta ? `Expected ${eta}` : null
    }

    return { id, state, timeLabel, actorLabel }
  })

  if (isTerminalIssue) {
    const lastActivity = activities[activities.length - 1]
    timelineRows.push({
      id: order.status,
      state: 'current',
      timeLabel: lastActivity ? formatActivityTime(lastActivity.at) : null,
      actorLabel: lastActivity?.actor ?? null,
    })
  }

  return {
    order,
    onClose,
    canVerify,
    productName,
    activities,
    actionType,
    actionNote,
    isOrderFuture,
    urgency,
    StatusIcon,
    wasRejected,
    isMarkedForReview,
    isPending,
    isTerminalIssue,
    horizontalOptions,
    horizontalCurrentIndex,
    timelineRows,
    lastIndex: timelineRows.length - 1,
    onActionNoteChange: setActionNote,
    onCloseAction: closeAction,
    onStartAction: setActionType,
    onConfirmAction: () => {
      const input = {
        orderNumber: order.orderNumber,
        expectedRevision: order.revision ?? 1,
        actor,
        note: actionNote.trim() || undefined,
      }
      const result = actionType === 'correction' ? markOrderForFinanceReview(input) : null
      if (result && !result.allowed) {
        toast({ title: 'Order was not updated', description: result.reason, variant: 'destructive' })
        return
      }
      closeAction()
      onClose()
    },
    onVerifyOrder: () => {
      const result = verifyOrderFinance({
        orderNumber: order.orderNumber,
        expectedRevision: order.revision ?? 1,
        actor,
      })
      if (!result.allowed) {
        toast({ title: 'Order was not verified', description: result.reason, variant: 'destructive' })
        return
      }
      onClose()
    },
  }
}
