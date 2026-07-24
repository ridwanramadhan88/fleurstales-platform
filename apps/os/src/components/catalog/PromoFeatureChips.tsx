/**
 * @file PromoFeatureChips.tsx
 * @description Shared "Featured" / "Promo" toggle chips used by both the
 * Catalog workspace and the bulk "Promo & feature
 * list" dialog (CatalogPromoFeatureDialog), so the two surfaces read as one
 * consistent design: Featured always uses the primary charcoal treatment with a sparkle icon, Promo is
 * always red with a tag icon.
 */

import type { FC } from 'react'
import { Sparkles, Tag } from 'lucide-react'

const baseChipClass =
  'tap-scale inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-2xs font-medium ring-1 transition'

const inactiveChipClass = 'bg-muted text-muted-foreground ring-border hover:bg-accent'

export interface ToggleChipProps {
  active: boolean
  onToggle: () => void
  disabled?: boolean
}

/**
 * @description Primary "Featured" toggle chip.
 */
export const FeaturedChip: FC<ToggleChipProps> = ({ active, onToggle, disabled }) => (
  <button
    type="button"
    onClick={onToggle}
    disabled={disabled}
    aria-pressed={active}
    className={`${baseChipClass} ${
      active ? 'bg-info/10 text-info ring-info/25' : inactiveChipClass
    } disabled:cursor-not-allowed disabled:opacity-50`}
  >
    <Sparkles className="size-3" />
    Featured
  </button>
)

/**
 * @description Red "Promo" toggle chip.
 */
export const PromoChip: FC<ToggleChipProps> = ({ active, onToggle, disabled }) => (
  <button
    type="button"
    onClick={onToggle}
    disabled={disabled}
    aria-pressed={active}
    className={`${baseChipClass} ${
      active ? 'bg-destructive/10 text-destructive ring-destructive/25' : inactiveChipClass
    } disabled:cursor-not-allowed disabled:opacity-50`}
  >
    <Tag className="size-3" />
    Promo
  </button>
)
