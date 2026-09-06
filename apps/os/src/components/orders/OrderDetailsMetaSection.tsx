import type { FC } from 'react'
import { DatePickerField, TimeSelectField } from '../ui/date-time-field'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select'
import type { OrderFulfillment, OrderSource } from '../../types/orders'
import {
  FULFILLMENT_OPTIONS,
  ORDER_SOURCE_OPTIONS,
  SOURCE_LABELS,
} from './orderTableLabels'
import {
  formatOrderCreatedAtLabel,
  getActualPickupLabel,
  getDisplayScheduleLabel,
  getRequestedPickupLabel,
} from './orderTableFormatters'
import type { OrderDetailsViewModel } from './OrderDetailsController'

interface OrderDetailsMetaSectionProps {
  viewModel: OrderDetailsViewModel
}

/**
 * @description Order facts for the Details tab: number, branch, time made,
 * source, fulfillment, and the requested schedule. Same draft/edit controls
 * the fulfillment grid always had — only their home changed.
 */
export const OrderDetailsMetaSection: FC<OrderDetailsMetaSectionProps> = ({
  viewModel,
}) => {
  const {
    order,
    isEditing,
    draft,
    onDraftChange,
    onFulfillmentChange,
  } = viewModel

  if (!isEditing) {
    const leftRows: Array<[string, string]> = [
      ['Order number', order.orderNumber],
      ['Source', SOURCE_LABELS[order.source]],
      ['Time made', formatOrderCreatedAtLabel(order.createdAtLabel)],
    ]
    const rightRows: Array<[string, string]> = [
      ['Branch', order.branch],
      ['Fulfillment', order.fulfillment === 'delivery' ? 'Delivery' : 'Pickup'],
    ]
    if (order.fulfillment === 'pickup') {
      rightRows.push(['Requested pickup', getRequestedPickupLabel(order) ?? 'Not set'])
      if (order.status === 'picked_up') {
        rightRows.push(['Actual pickup', getActualPickupLabel(order) ?? 'Not recorded'])
      }
    } else {
      rightRows.push(['Delivery schedule', getDisplayScheduleLabel(order) ?? 'Not set'])
    }

    return (
      <section className="rounded-2xl bg-surface-card p-4 ring-1 ring-border/60" aria-label="Order details">
        <div className="grid gap-x-6 gap-y-1 sm:grid-cols-[repeat(2,minmax(0,1fr))] sm:gap-x-6">
          {[leftRows, rightRows].map((rows, groupIndex) => (
            <dl key={groupIndex} className={groupIndex === 1 ? 'divide-y divide-border/50 sm:border-l sm:border-border/50 sm:pl-6' : 'divide-y divide-border/50'}>
              {rows.map(([label, value]) => (
                <div key={label} className="flex items-baseline justify-between gap-4 py-2.5">
                  <dt className="shrink-0 text-xs text-muted-foreground">{label}</dt>
                  <dd className="break-words text-right text-sm font-medium text-foreground">{value}</dd>
                </div>
              ))}
            </dl>
          ))}
        </div>
      </section>
    )
  }

  // The edit draft keeps one unified schedule (scheduleDate/scheduleTime)
  // regardless of fulfillment type — same fields the save flow persists.
  const isDelivery = draft.fulfillment === 'delivery'

  return (
    <section className="space-y-3 rounded-2xl bg-surface-card p-4 ring-1 ring-border/60" aria-label="Order details">
      <div className="grid gap-3 sm:grid-cols-[repeat(2,minmax(0,1fr))] sm:gap-x-6">
        <div className="space-y-3">
          <label className="space-y-1 text-2xs font-medium text-muted-foreground/80">
            Source
            <Select
              value={draft.source}
              onValueChange={(value) => onDraftChange('source', value as OrderSource)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ORDER_SOURCE_OPTIONS.map((option) => (
                  <SelectItem key={option.id} value={option.id}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          <label className="space-y-1 text-xs font-normal text-muted-foreground/80">
            {isDelivery ? 'Delivery date' : 'Pickup date'}
            <DatePickerField
              value={draft.scheduleDate}
              onChange={(value) => onDraftChange('scheduleDate', value)}
              placeholder="Pick date"
              className="text-sm"
            />
          </label>
        </div>
        <div className="space-y-3 sm:border-l sm:border-border/50 sm:pl-6">
          <label className="space-y-1 text-2xs font-medium text-muted-foreground/80">
            Fulfillment
            <Select
              value={draft.fulfillment}
              onValueChange={(value) => onFulfillmentChange(value as OrderFulfillment)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FULFILLMENT_OPTIONS.map((option) => (
                  <SelectItem key={option.id} value={option.id}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          <label className="space-y-1 text-xs font-normal text-muted-foreground/80">
            {isDelivery ? 'Delivery time' : 'Pickup time'}
            <TimeSelectField
              value={draft.scheduleTime}
              onChange={(value) => onDraftChange('scheduleTime', value)}
              placeholder="Pick time"
              className="text-sm"
            />
          </label>
        </div>
      </div>
    </section>
  )
}

export default OrderDetailsMetaSection
