/**
 * @file CustomerListItem.tsx
 * @description Presentational list item for a single customer in the CRM list.
 * All behavioural meaning (segment, activity level, value score) comes from
 * the customerDomain. This component only renders domain outputs.
 */

import type { FC } from 'react'
import { MessageCircle, MoreVertical, Ticket, Trash2, User } from 'lucide-react'
import type { CustomerProfile } from '../../store/customerStoreTypes'
import type { CustomerMetrics } from '../../domain/customerDomain'
import {
  getCustomerActivityLevel,
  getCustomerValueScore,
} from '../../domain/customerDomain'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu'

/**
 * @description Props for the CustomerListItem component.
 */
export interface CustomerListItemProps {
  /** Raw customer profile. */
  customer: CustomerProfile
  /** Domain-derived metrics for this customer. */
  metrics: CustomerMetrics
  /** Called when the profile drawer should open. */
  onOpenProfile: () => void
  /** Called when staff picks "Assign promo" from the card menu. */
  onAssignPromo: () => void
  onRemove?: () => void
}

/**
 * @description Presentational CRM customer row using domain metrics only.
 */
export const CustomerListItem: FC<CustomerListItemProps> = ({
  customer,
  metrics,
  onOpenProfile,
  onAssignPromo,
  onRemove,
}) => {
  const activity = getCustomerActivityLevel(metrics)
  const valueScore = getCustomerValueScore(metrics)

  const segmentLabelMap = {
    vip: 'VIP',
    regular: 'Regular',
    new: 'New',
  } as const

  const segmentClassMap: Record<
    keyof typeof segmentLabelMap,
    string
  > = {
    vip: 'bg-warning/10 text-warning ring-warning/15',
    regular: 'bg-success/10 text-success ring-success/15',
    new: 'bg-muted text-foreground/90 ring-border',
  }

  const activityLabelMap = {
    active: 'Active',
    inactive: 'Inactive',
  } as const

  const activityClassMap = {
    active: 'text-success',
    inactive: 'text-muted-foreground',
  } as const

  const segment = metrics.segment
  const segmentLabel = segmentLabelMap[segment]
  const segmentClass = segmentClassMap[segment]
  const activityLabel = activityLabelMap[activity]
  const activityClass = activityClassMap[activity]

  const formatter = new Intl.NumberFormat('id-ID')

  return (
    <div className="flex w-full items-start gap-3 rounded-xl bg-surface-card p-3 text-xs text-foreground ring-1 ring-border/60 transition hover:bg-muted/60">
      <button
        type="button"
        onClick={onOpenProfile}
        className="flex min-w-0 flex-1 items-start gap-3 text-left min-h-14 py-3"
      >
        <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary text-secondary-foreground">
          <User className="size-4" />
        </span>
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-sm font-semibold leading-5 text-foreground">
              {customer.name}
            </span>
            <span
              className={`inline-flex items-center rounded-full px-2 py-0.5 text-2xs font-medium ring-1 ${segmentClass}`}
            >
              {segmentLabel}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <MessageCircle className="hidden size-3.5 sm:block" />
              {customer.whatsappNumber}
            </span>
            {customer.preferredBranch && (
              <>
                <span className="h-0.5 w-0.5 rounded-full bg-muted-foreground/30" />
                <span>{customer.preferredBranch}</span>
              </>
            )}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">{metrics.orderCount} orders</span>
            <span>Rp {formatter.format(metrics.lifetimeSpend)} lifetime</span>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 text-2xs text-muted-foreground">
            <span className={activityClass}>{activityLabel}</span>
            {metrics.lastOrderDateLabel && <span>· Last {metrics.lastOrderDateLabel}</span>}
            <span>· Score {valueScore}</span>
          </div>
        </div>
      </button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={`More actions for ${customer.name}`}
            className="tap-scale mr-1 inline-flex shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground rounded-full p-0 size-11 rounded-full p-0 whitespace-nowrap"
          >
            <MoreVertical className="size-3.5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={onAssignPromo}>
            <Ticket className="size-3.5" />
            Assign promo
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onOpenProfile}>
            <User className="size-3.5" />
            View profile
          </DropdownMenuItem>
          {onRemove && <DropdownMenuItem onClick={onRemove} className="text-destructive focus:text-destructive">
            <Trash2 className="size-3.5" />
            Remove customer
          </DropdownMenuItem>}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

export default CustomerListItem
