/**
 * @file CatalogProductDetailSheet.tsx
 * @description Detail popup for a single catalog product, opened by tapping
 * a row in the Product Catalog list. Shows image, description, pricing,
 * variants, and flags, plus Edit / Archive actions. Read-only when the role
 * can't edit Catalog.
 */

import type { FC } from 'react'
import { ImageOff, Pencil, Archive, ArchiveRestore, X } from 'lucide-react'
import type { CatalogProduct } from '../../store/catalogStoreTypes'
import { getDisplayPriceIdr } from '../../domain/catalogDomain'

export interface CatalogProductDetailSheetProps {
  open: boolean
  product: CatalogProduct | null
  formatter: Intl.NumberFormat
  onClose: () => void
  onEditRequest: () => void
  onToggleActive: (isActive: boolean) => void
  canEdit?: boolean
}

/**
 * @description Full detail view for one catalog product.
 */
export const CatalogProductDetailSheet: FC<CatalogProductDetailSheetProps> = ({
  open,
  product,
  formatter,
  onClose,
  onEditRequest,
  onToggleActive,
  canEdit = true,
}) => {
  if (!open || !product) return null

  const displayPriceIdr = getDisplayPriceIdr(product)

  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-black/32 backdrop-blur-[2px] sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        className="animate-sheet-up max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-card shadow-lg ring-1 ring-border/60 sm:max-h-[90vh] sm:rounded-xl"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-2 border-b border-border/70 px-5 py-3.5">
          <div className="space-y-0.5">
            <h2 className="text-lg font-semibold leading-6 text-foreground">
              {product.name}
            </h2>
            <p className="text-xs text-muted-foreground">
              {product.productId} · {product.category} · {product.material === 'fresh' ? 'Fresh' : 'Artificial'}
              {!product.isActive && ' · Archived'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="tap-scale inline-flex shrink-0 cursor-pointer items-center justify-center rounded-full bg-transparent text-muted-foreground transition hover:bg-muted/70 hover:text-foreground rounded-full p-0 size-11 rounded-full p-0 whitespace-nowrap"
            aria-label="Close product detail"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="space-y-3 px-5 py-4">
          <div className="aspect-[4/3] w-full overflow-hidden rounded-lg bg-muted">
            {product.thumbnail ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={product.thumbnail}
                alt={product.name}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-muted-foreground/40">
                <ImageOff className="size-8" />
              </div>
            )}
          </div>

          {product.description && (
            <p className="text-sm text-muted-foreground">
              {product.description}
            </p>
          )}

          <section className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-xs bg-muted px-3 py-3 text-xs">
            <div>
              <p className="text-2xs font-semibold text-muted-foreground">Main occasion</p>
              <p className="mt-0.5 font-medium text-foreground">{product.category}</p>
            </div>
            <div>
              <p className="text-2xs font-semibold text-muted-foreground">Arrangement type</p>
              <p className="mt-0.5 font-medium text-foreground">{product.productType ?? '—'}</p>
            </div>
            <div>
              <p className="text-2xs font-semibold text-muted-foreground">Collection / Series</p>
              <p className="mt-0.5 font-medium text-foreground">{product.collectionSeries ?? '—'}</p>
            </div>
            <div>
              <p className="text-2xs font-semibold text-muted-foreground">Pricing / Order type</p>
              <p className="mt-0.5 font-medium text-foreground">{product.pricingType ?? 'Fixed'} · {product.orderType ?? 'Catalog'}</p>
            </div>
            <div className="col-span-2">
              <p className="text-2xs font-semibold text-muted-foreground">Occasion tags</p>
              <p className="mt-0.5 font-medium text-foreground">{(product.occasionTags?.length ? product.occasionTags : [product.category]).join(' · ')}</p>
            </div>
          </section>

          <section className="rounded-xs bg-muted px-3 py-2">
            <p className="text-2xs font-semibold text-muted-foreground">
              From
            </p>
            <p className="text-sm font-semibold leading-5 text-foreground">
              {product.originalPriceIdr && (
                <span className="mr-1.5 text-2xs text-muted-foreground line-through">
                  {formatter.format(product.originalPriceIdr)}
                </span>
              )}
              {formatter.format(displayPriceIdr)}
            </p>
            {product.promoLabel && (
              <p className="text-2xs text-destructive">{product.promoLabel}</p>
            )}
          </section>

          <section className="space-y-1.5 rounded-xs bg-muted px-3 py-3">
            <p className="text-2xs font-semibold text-muted-foreground">
              Variants
            </p>
            <div className="space-y-1.5">
              {product.variants.map((variant) => (
                <div
                  key={variant.id}
                  className="flex items-center justify-between gap-2 text-sm"
                >
                  <div className="min-w-0">
                    <p className="truncate text-foreground/90">{variant.size}</p>
                    <p className="truncate text-2xs text-muted-foreground">
                      {variant.sku}
                      {variant.status === 'inactive' ? ' · Inactive' : ''}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-medium text-foreground">
                      {formatter.format(variant.price)}
                    </p>
                    {variant.cost !== undefined && (
                      <p className="text-2xs text-muted-foreground">
                        Cost {formatter.format(variant.cost)}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <div className="flex flex-wrap gap-1.5">
            {product.isFeatured && (
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-2xs font-medium text-primary ring-1 ring-primary/15">
                Featured
              </span>
            )}
            {product.isCustomizable && (
              <span className="rounded-full bg-surface-neutral px-2 py-0.5 text-2xs font-medium text-foreground ring-1 ring-border/80">
                Customizable
              </span>
            )}
          </div>
        </div>

        {/* Footer actions */}
        {canEdit && (
          <div className="flex items-center justify-between gap-2 border-t border-border bg-card px-5 py-3">
            <button
              type="button"
              onClick={() => onToggleActive(!product.isActive)}
              className="inline-flex h-11 items-center gap-2 rounded-full px-[18px] text-sm font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground"
            >
              {product.isActive ? (
                <>
                  <Archive className="size-3.5" />
                  Archive
                </>
              ) : (
                <>
                  <ArchiveRestore className="size-3.5" />
                  Unarchive
                </>
              )}
            </button>
            <button
              type="button"
              onClick={onEditRequest}
              className="inline-flex items-center rounded-full bg-primary text-xs font-medium text-white shadow-ios-sm transition hover:bg-primary rounded-full px-[18px] whitespace-nowrap h-11 rounded-full px-[18px] gap-2 whitespace-nowrap"
            >
              <Pencil className="size-3.5" />
              Edit product
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

export default CatalogProductDetailSheet
