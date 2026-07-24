/**
 * @file StorefrontProductDetailSheet.tsx
 * @description Customer-facing product detail view, opened by tapping any
 * storefront product card. Shows the full (non-truncated) description,
 * variant picker when the product has size/color options, a quantity
 * stepper, and an "Add to cart" action — everything the compact card can't
 * fit. Mirrors CartDrawer's bottom-sheet-on-mobile / side-panel-on-desktop
 * shell for a consistent feel across the storefront.
 */

import type { FC } from 'react'
import { useEffect, useState } from 'react'
import { ImageOff, Minus, Plus, X } from 'lucide-react'
import type { CatalogProduct, CatalogVariant } from '../../store/catalogStoreTypes'
import { useDismissableModal } from '../../hooks/useDismissableModal'
import { getDisplayPriceIdr, getPromoPercentLabel } from '../../domain/catalogDomain'

export interface StorefrontProductDetailSheetProps {
  product: CatalogProduct | null
  onClose: () => void
  formatter: Intl.NumberFormat
  /** Called with the product id, chosen variant (if any), and quantity. */
  onAddToCart: (
    productId: string,
    quantity: number,
    variant?: CatalogVariant,
  ) => void
}

export const StorefrontProductDetailSheet: FC<StorefrontProductDetailSheetProps> = ({
  product,
  onClose,
  formatter,
  onAddToCart,
}) => {
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(null)
  const [quantity, setQuantity] = useState(1)

  const open = Boolean(product)
  useDismissableModal(open, onClose)

  // Reset local selection state whenever a different product is opened.
  useEffect(() => {
    if (product) {
      setSelectedVariantId(product.variants?.[0]?.id ?? null)
      setQuantity(1)
    }
  }, [product])

  if (!product) return null

  const selectedVariant = product.variants?.find(
    (variant) => variant.id === selectedVariantId,
  )
  const unitPriceIdr = selectedVariant?.price ?? getDisplayPriceIdr(product)
  const totalIdr = unitPriceIdr * quantity
  const promoPercentLabel = getPromoPercentLabel(product, unitPriceIdr)

  const handleAdd = () => {
    onAddToCart(product.id, quantity, selectedVariant)
    onClose()
  }

  return (
    <div
      className="storefront-modal-layer fixed inset-0 z-40 flex items-end justify-center bg-black/40 px-0 sm:items-center sm:px-5"
      onClick={onClose}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        className="storefront-popup-enter flex max-h-[90vh] w-full max-w-[560px] flex-col rounded-t-[var(--sf-radius-panel)] bg-[var(--sf-cream)] text-black shadow-[-14px_0_42px_rgba(0,0,0,0.16)] sm:rounded-[var(--sf-radius-panel)]"
      >
        <div className="relative">
          <div className="relative aspect-[4/3] w-full overflow-hidden rounded-t-[var(--sf-radius-panel)] bg-[#eee4cc]">
            {product.thumbnail ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={product.thumbnail}
                alt={product.name}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-black/35">
                <ImageOff className="size-8" strokeWidth={1.5} />
                <span className="sf-label">No photo yet</span>
              </div>
            )}
            {promoPercentLabel && (
              <span className="sf-promo-badge absolute left-3 top-3 bg-[#f569a3] text-black">
                {promoPercentLabel}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="tap-scale absolute right-3 top-3 inline-flex size-11 items-center justify-center rounded-full bg-[var(--sf-cream)] text-black shadow-sm hover:bg-[var(--sf-cream)]"
            aria-label="Close"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="storefront-checkout-scroll flex-1 space-y-6 overflow-y-auto px-[18px] py-6 sm:px-7">
          <div className="space-y-2">
            <h2 className="sf-type-4 font-medium leading-none">
              {product.name}
            </h2>
            {product.description && (
              <p className="sf-body text-black/58">
                {product.description}
              </p>
            )}
          </div>

          <div className="flex items-baseline gap-2">
            {product.originalPriceIdr && !selectedVariant && (
              <span className="sf-type-2 text-black/42 line-through">
                {formatter.format(product.originalPriceIdr)}
              </span>
            )}
            <span className="sf-type-4 font-medium">
              {formatter.format(unitPriceIdr)}
            </span>
          </div>

          {product.isCustomizable && (
            <p className="rounded-[var(--sf-radius-field)] bg-[#eee4cc] px-4 py-3 sf-support text-black/55">
              This product is customizable — leave a note at checkout for any
              special requests.
            </p>
          )}

          {product.variants.length > 1 && (
            <div className="space-y-1.5">
              <p className="sf-label text-black/50">Options</p>
              <div className="flex flex-wrap gap-2">
                {product.variants.map((variant) => (
                  <button
                    key={variant.id}
                    type="button"
                    onClick={() => setSelectedVariantId(variant.id)}
                    className={`tap-scale min-h-11 rounded-full border px-4 py-2 sf-type-2 font-medium transition ${
                      selectedVariantId === variant.id
                        ? 'border-[#00813f] bg-[#00813f] text-white'
                        : 'border-black/16 bg-white/55 text-black hover:bg-white'
                    }`}
                  >
                    {variant.size} · {formatter.format(variant.price)}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center justify-between">
            <p className="sf-label text-black/50">Quantity</p>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setQuantity((value) => Math.max(1, value - 1))}
                className="tap-scale inline-flex size-11 items-center justify-center rounded-full border border-black/16 bg-white/60 text-black/58 hover:bg-white hover:text-black"
                aria-label="Decrease quantity"
              >
                <Minus className="size-3.5" />
              </button>
              <span className="w-8 text-center sf-type-2 font-medium text-black">
                {quantity}
              </span>
              <button
                type="button"
                onClick={() => setQuantity((value) => value + 1)}
                className="tap-scale inline-flex size-11 items-center justify-center rounded-full border border-black/16 bg-white/60 text-black/58 hover:bg-white hover:text-black"
                aria-label="Increase quantity"
              >
                <Plus className="size-3.5" />
              </button>
            </div>
          </div>
        </div>

        <div className="space-y-4 border-t border-black/12 bg-[var(--sf-cream)] px-[18px] py-4 sm:px-7">
          <div className="flex items-center justify-between sf-type-2">
            <span className="text-black/50">Total</span>
            <span className="sf-type-4 font-medium text-black">
              {formatter.format(totalIdr)}
            </span>
          </div>
          <button
            type="button"
            onClick={handleAdd}
            className="sf-primary-action tap-scale flex w-full items-center justify-center gap-2"
          >
            <Plus className="size-3.5" />
            Add to cart
          </button>
        </div>
      </div>
    </div>
  )
}

export default StorefrontProductDetailSheet
