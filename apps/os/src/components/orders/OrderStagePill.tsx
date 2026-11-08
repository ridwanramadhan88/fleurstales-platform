import type { FC } from 'react'
import type { OrderTableRow } from '../../types/orders'
import type { OrderWorkStage } from '../../domain/orderWorkStageDomain'
import { ORDER_WORK_STAGE_STYLE, getOrderWorkStageLabel } from './orderWorkStagePresentation'

/** The coloured stage pill used in the work list and the order windows. */
export const OrderStagePill: FC<{
  stage: OrderWorkStage
  order: Pick<OrderTableRow, 'fulfillment' | 'status'>
  copy: (en: string, id: string) => string
  compact?: boolean
}> = ({ stage, order, copy, compact }) => {
  const style = ORDER_WORK_STAGE_STYLE[stage]
  const Icon = style.icon
  return (
    <span
      data-stage={stage}
      className={`inline-flex max-w-full items-center gap-1.5 rounded-full font-semibold ${style.pillClass} ${compact ? 'h-6 py-0 pl-[3px] pr-2.5 text-xs' : 'h-[30px] py-0 pl-1 pr-3 text-[13px]'}`}
    >
      <span aria-hidden="true" className={`flex shrink-0 items-center justify-center rounded-full text-white ${style.dotClass} ${compact ? 'size-[18px]' : 'size-[22px]'}`}>
        <Icon className={compact ? 'size-2.5' : 'size-3'} strokeWidth={2.6} />
      </span>
      <span className="truncate">{getOrderWorkStageLabel(stage, order, copy)}</span>
    </span>
  )
}
