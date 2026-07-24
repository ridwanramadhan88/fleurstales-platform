/**
 * @file CatalogProductRow.tsx
 * @description Compact single-line row for a catalog product in the
 * Product Catalog list. Replaces the previous image-grid card in the list
 * itself — full detail (description, variants, image) now lives in
 * CatalogProductDetailSheet, opened on tap.
 */

import type { FC } from 'react'
import { ChevronRight, ImageOff, MoreHorizontal, Pencil, Sparkles, Tag, Archive, ArchiveRestore } from 'lucide-react'
import type { CatalogProduct } from '../../store/catalogStoreTypes'
import { getDisplayPriceIdr } from '../../domain/catalogDomain'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../ui/dropdown-menu'

export interface CatalogProductRowProps {
  product: CatalogProduct
  formatter: Intl.NumberFormat
  manageMode: boolean
  selected: boolean
  onToggleSelect: () => void
  onOpenDetail: () => void
  canEdit?: boolean
  onEdit?: () => void
  onToggleFeatured?: () => void
  onTogglePromo?: () => void
  onToggleActive?: () => void
}

/**
 * @description One compact, tappable row per catalog product.
 */
export const CatalogProductRow: FC<CatalogProductRowProps> = ({
  product,
  formatter,
  manageMode,
  selected,
  onToggleSelect,
  onOpenDetail,
  canEdit = false,
  onEdit,
  onToggleFeatured,
  onTogglePromo,
  onToggleActive,
}) => {
  const displayPriceIdr = getDisplayPriceIdr(product)
  const hasVariants = product.variants.length > 1

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => (manageMode ? onToggleSelect() : onOpenDetail())}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          manageMode ? onToggleSelect() : onOpenDetail()
        }
      }}
      className={`flex min-h-[88px] cursor-pointer items-center gap-4 rounded-2xl border bg-surface-card px-4 py-3.5 shadow-ios-sm transition hover:bg-accent/40 ${selected ? 'border-primary/35 bg-primary/[0.035]' : 'border-border'} ${!product.isActive ? 'opacity-60' : ''}`}
    >
      {manageMode && (
        <input
          type="checkbox"
          checked={selected}
          onChange={(event) => {
            event.stopPropagation()
            onToggleSelect()
          }}
          onClick={(event) => event.stopPropagation()}
          className="size-5 shrink-0 rounded accent-foreground"
        />
      )}

      <div className="size-14 shrink-0 overflow-hidden rounded-xl bg-muted">
        {product.thumbnail ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={product.thumbnail}
            alt={product.name}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-muted-foreground/40">
            <ImageOff className="size-4" />
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-base font-semibold text-foreground">
          {product.name}
        </p>
        <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <span className="truncate text-xs text-muted-foreground">
            {product.productId}
          </span>
          <span className="inline-flex max-w-[7rem] shrink-0 items-center truncate rounded-full bg-surface-neutral px-2 py-0.5 text-2xs font-medium text-foreground ring-1 ring-border/80">
            {product.category}
          </span>
          {product.productType && (
            <span className="inline-flex max-w-[9rem] shrink-0 items-center truncate rounded-full bg-surface-neutral px-2 py-0.5 text-2xs font-medium text-foreground ring-1 ring-border/80">
              {product.productType}
            </span>
          )}
          {!product.isActive && (
            <span className="inline-flex shrink-0 items-center rounded-full bg-surface-neutral px-2 py-0.5 text-2xs font-medium text-foreground ring-1 ring-border/80">
              Archived
            </span>
          )}
          {product.promoLabel && (
            <span className="inline-flex shrink-0 items-center rounded-full bg-destructive/10 px-2 py-0.5 text-2xs font-medium text-destructive">
              {product.promoLabel}
            </span>
          )}
        </div>
      </div>

      <div className="shrink-0 text-right">
        <p className="text-base font-semibold leading-5 text-foreground">
          {hasVariants ? 'From ' : ''}
          {formatter.format(displayPriceIdr)}
        </p>
        {product.isFeatured && (
          <p className="text-2xs font-medium text-primary">★ Featured</p>
        )}
      </div>

      {!manageMode && canEdit ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label={`Product actions for ${product.name}`}
              onClick={(event) => event.stopPropagation()}
              className="inline-flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground"
            >
              <MoreHorizontal className="size-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" onClick={(event) => event.stopPropagation()}>
            {onEdit && <DropdownMenuItem onClick={onEdit}><Pencil className="mr-2 size-4" />Edit product</DropdownMenuItem>}
            {onToggleFeatured && <DropdownMenuItem onClick={onToggleFeatured}><Sparkles className="mr-2 size-4" />{product.isFeatured ? 'Remove featured' : 'Mark as featured'}</DropdownMenuItem>}
            {onTogglePromo && <DropdownMenuItem onClick={onTogglePromo}><Tag className="mr-2 size-4" />{product.promoLabel ? 'Remove promotion' : 'Add 10% promotion'}</DropdownMenuItem>}
            {onToggleActive && <DropdownMenuItem onClick={onToggleActive}>{product.isActive ? <Archive className="mr-2 size-4" /> : <ArchiveRestore className="mr-2 size-4" />}{product.isActive ? 'Archive product' : 'Restore product'}</DropdownMenuItem>}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : !manageMode ? (
        <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
      ) : null}
    </div>
  )
}

export default CatalogProductRow
