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
import { AppDialog } from '../ui/app-dialog'
import { Button } from '../ui/button'

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
    <>
      <Button
        type="button"
        variant="outline"
        size="md"
        onClick={onToggleEditing}
        aria-label="VIP customer rules"
        className="w-full sm:w-auto"
      >
        <Crown className="size-4 text-warning" />
        VIP rules
      </Button>

      <AppDialog
        open={isEditing}
        onOpenChange={(nextOpen) => { if (!nextOpen) onToggleEditing() }}
        title="VIP customer rules"
        description={`A customer becomes VIP when they reach ${summaryLabel}.`}
        size="compact"
      >
        <div className="space-y-4 pt-1">
          <p className="text-xs leading-5 text-muted-foreground">
            Choose how the two conditions combine, then set your thresholds.
            Updates VIP segmentation everywhere immediately.
          </p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2" role="group" aria-label="VIP rule mode">
            {modeOptions.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => onSetSegmentRules({ mode: option.id })}
                aria-pressed={segmentRules.mode === option.id}
                className={`tap-scale min-h-11 rounded-xl border px-3 py-2 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35 ${
                  segmentRules.mode === option.id
                    ? 'border-primary bg-primary/5 ring-1 ring-primary/30'
                    : 'border-border bg-card hover:bg-accent'
                }`}
              >
                <span className="block text-sm font-semibold text-foreground">
                  {option.label}
                </span>
                <span className="mt-0.5 block text-xs leading-4 text-muted-foreground">
                  {option.description}
                </span>
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-muted-foreground">
                Minimum lifetime spend (IDR)
              </span>
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
                className="h-11 w-full rounded-xl border border-border/70 bg-surface-panel px-3.5 text-sm text-foreground outline-none transition placeholder:text-muted-foreground hover:border-border focus:border-primary/40 focus:ring-2 focus:ring-primary/25 disabled:cursor-not-allowed disabled:opacity-50"
              />
            </label>
            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-muted-foreground">
                Minimum order count
              </span>
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
                className="h-11 w-full rounded-xl border border-border/70 bg-surface-panel px-3.5 text-sm text-foreground outline-none transition placeholder:text-muted-foreground hover:border-border focus:border-primary/40 focus:ring-2 focus:ring-primary/25 disabled:cursor-not-allowed disabled:opacity-50"
              />
            </label>
          </div>

          <div className="flex justify-end border-t border-border/60 pt-4">
            <Button type="button" onClick={onToggleEditing}>
              Done
            </Button>
          </div>
        </div>
      </AppDialog>
    </>
  )
}

export default CustomerSegmentRulesSettings
