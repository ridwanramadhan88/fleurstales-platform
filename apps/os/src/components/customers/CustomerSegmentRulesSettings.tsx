/**
 * @file CustomerSegmentRulesSettings.tsx
 * @description Owner-editable settings for what makes a customer "VIP" in
 * the Customers CRM tab — e.g. a minimum number of orders and/or a minimum
 * lifetime spend. Mirrors the collapsed "Edit / Done" settings pattern used
 * by PaymentMethodSettings (Finance tab) for a consistent page design.
 * Values are read by customerDomain.getCustomerSegment and must not be
 * re-implemented anywhere else in the UI.
 */

import type { FC } from 'react'
import { Crown } from 'lucide-react'
import type { VipRuleMode } from '../../store/customerStoreTypes'
import type { CustomerSegmentRulesSettingsViewModel } from './CustomerSegmentRulesSettingsController'

const modeOptions: { id: VipRuleMode; label: string; description: string }[] = [
  {
    id: 'either',
    label: 'Either',
    description: 'VIP if spend OR order count meets its minimum.',
  },
  {
    id: 'both',
    label: 'Both',
    description: 'VIP requires both spend and order minimums.',
  },
  {
    id: 'spend',
    label: 'Spend only',
    description: 'VIP is based only on lifetime spend.',
  },
  {
    id: 'orders',
    label: 'Orders only',
    description: 'VIP is based only on order count.',
  },
]

export const CustomerSegmentRulesSettings: FC<
  CustomerSegmentRulesSettingsViewModel
> = ({
  isOwner,
  isEditing,
  segmentRules,
  summaryLabel,
  onToggleEditing,
  onSetSegmentRules,
}) => {
  if (!isOwner) return null

  return (
    <section
      aria-label="VIP customer rules"
      className="space-y-3 rounded-lg bg-muted px-3 py-3"
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
          <Crown className="size-3.5" />
          VIP customer rules
        </h3>
        <button
          type="button"
          onClick={onToggleEditing}
          className="text-xs font-medium text-primary underline-offset-2 hover:underline min-h-11 rounded-full px-[18px] whitespace-nowrap"
        >
          {isEditing ? 'Done' : 'Edit'}
        </button>
      </div>

      {!isEditing ? (
        <p className="rounded-lg bg-card px-3 py-2 text-xs text-foreground/90 ring-1 ring-border">
          A customer becomes <span className="font-semibold text-warning">VIP</span>{' '}
          when they reach {summaryLabel}.
        </p>
      ) : (
        <div className="space-y-3">
          <p className="text-2xs text-muted-foreground">
            Choose how the two conditions below combine, then set your
            thresholds. This updates VIP segmentation everywhere immediately.
          </p>

          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
            {modeOptions.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => onSetSegmentRules({ mode: option.id })}
                title={option.description}
                className={`tap-scale rounded-lg border px-2 py-1.5 text-xs font-medium transition ${
                  segmentRules.mode === option.id
                    ? 'border-primary bg-primary/5 text-foreground'
                    : 'border-border bg-card text-foreground hover:bg-accent'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div className="space-y-1 rounded-lg bg-card px-3 py-2 ring-1 ring-border">
              <label className="text-2xs font-semibold text-muted-foreground">
                Minimum lifetime spend (IDR)
              </label>
              <input
                type="number"
                min={0}
                step={50000}
                value={segmentRules.minLifetimeSpend}
                onChange={(event) =>
                  onSetSegmentRules({
                    minLifetimeSpend: Math.max(
                      0,
                      Number.parseInt(event.target.value, 10) || 0,
                    ),
                  })
                }
                disabled={segmentRules.mode === 'orders'}
                className="h-9 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/30 dark:focus:ring-primary/40 disabled:cursor-not-allowed disabled:opacity-50"
              />
            </div>
            <div className="space-y-1 rounded-lg bg-card px-3 py-2 ring-1 ring-border">
              <label className="text-2xs font-semibold text-muted-foreground">
                Minimum order count
              </label>
              <input
                type="number"
                min={0}
                step={1}
                value={segmentRules.minOrderCount}
                onChange={(event) =>
                  onSetSegmentRules({
                    minOrderCount: Math.max(
                      0,
                      Number.parseInt(event.target.value, 10) || 0,
                    ),
                  })
                }
                disabled={segmentRules.mode === 'spend'}
                className="h-9 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/30 dark:focus:ring-primary/40 disabled:cursor-not-allowed disabled:opacity-50"
              />
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

export default CustomerSegmentRulesSettings
