/**
 * @file CatalogPromoFeatureDialog.tsx
 * @description "Promo & feature list" dialog for the Catalog tab. Gives a
 * single place to see and manage which active products are Featured and
 * which are running a percent-off promo, without opening each product's
 * edit form individually. Mirrors CatalogCategoriesDialog's popup pattern.
 * Featured / Promo use the same blue / red chip styling as the product
 * Catalog workspace controls.
 */

import type { FC } from 'react'
import { Search, Sparkles, Tag } from 'lucide-react'
import { FeaturedChip, PromoChip } from './PromoFeatureChips'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '../ui/dialog'
import type { CatalogPromoFeatureDialogViewModel } from './CatalogPromoFeatureDialogController'

export interface CatalogPromoFeatureDialogProps {
  open: boolean
  onClose: () => void
}

export const CatalogPromoFeatureDialog: FC<CatalogPromoFeatureDialogViewModel> = ({
  open,
  onClose,
  query,
  activeProducts,
  featuredCount,
  promoCount,
  onQueryChange,
  getPromoPercent,
  onToggleFeatured,
  onTogglePromo,
  onSetPromoPercent,
}) => {
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
    >
      <DialogContent className="max-w-lg gap-3">
        <DialogHeader>
          <DialogTitle>Promo & feature list</DialogTitle>
          <DialogDescription>
            Manage which active products are Featured and which have a
            percent-off promo running.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2 text-2xs">
          <span className="inline-flex items-center gap-1 rounded-full bg-info/10 px-2.5 py-1 font-medium text-info ring-1 ring-info/25">
            <Sparkles className="size-3" />
            {featuredCount} featured
          </span>
          <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2.5 py-1 font-medium text-destructive ring-1 ring-destructive/25">
            <Tag className="size-3" />
            {promoCount} on promo
          </span>
        </div>

        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Search products…"
            className="h-9 w-full rounded-full border border-border bg-background pl-8 pr-3 text-sm outline-none placeholder:text-muted-foreground focus:border-primary/50"
          />
        </div>

        <div className="max-h-[50vh] space-y-2 overflow-y-auto">
          {activeProducts.length === 0 && (
            <p className="py-4 text-center text-xs text-muted-foreground">
              No active products match your search.
            </p>
          )}
          {activeProducts.map((product) => {
            const promoEnabled = Boolean(product.promoLabel)
            const promoPercent = getPromoPercent(product.promoLabel)
            return (
              <div
                key={product.id}
                className="space-y-2 rounded-lg border border-border/70 bg-card px-3 py-2.5"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">
                    {product.name}
                  </p>
                  <p className="text-2xs text-muted-foreground">
                    {product.productId}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <FeaturedChip
                    active={Boolean(product.isFeatured)}
                    onToggle={() =>
                      onToggleFeatured(product.id, !product.isFeatured)
                    }
                  />
                  <PromoChip
                    active={promoEnabled}
                    onToggle={() =>
                      onTogglePromo(product.id, !promoEnabled, promoPercent)
                    }
                  />
                  {promoEnabled && (
                    <div className="flex items-center gap-1.5">
                      <input
                        type="number"
                        min={1}
                        max={99}
                        value={promoPercent}
                        onChange={(event) =>
                          onSetPromoPercent(product.id, event.target.value)
                        }
                        placeholder="10"
                        className="h-7 w-16 rounded-md border border-border bg-background px-2 text-xs outline-none focus:border-primary/50"
                      />
                      <span className="text-xs text-muted-foreground">% off</span>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </DialogContent>
    </Dialog>
  )
}

export default CatalogPromoFeatureDialog
