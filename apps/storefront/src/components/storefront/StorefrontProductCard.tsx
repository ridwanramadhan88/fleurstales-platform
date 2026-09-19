import { useState, type FC, type MouseEvent } from 'react'
import type { CatalogProduct } from '../../store/catalogStoreTypes'
import { getDisplayPriceIdr, getPromoPercentLabel } from '../../domain/catalogDomain'
import { getStorefrontProductThumbnail } from './storefrontProductImages'
import { formatIdr } from '../../lib/currency'

export interface StorefrontProductCardProps {
  product: CatalogProduct
  formatter: Intl.NumberFormat
  onOpenDetail: () => void
  presentation?: 'default' | 'collection'
  tabIndex?: number
  ariaHidden?: boolean
}

export const StorefrontProductCard: FC<StorefrontProductCardProps> = ({
  product,
  formatter,
  onOpenDetail,
  presentation = 'default',
  tabIndex,
  ariaHidden,
}) => {
  const displayPriceIdr = getDisplayPriceIdr(product)
  const hasVariants = product.variants.length > 1
  const promoPercentLabel = getPromoPercentLabel(product, displayPriceIdr)
  const displayImage = getStorefrontProductThumbnail(product)
  const isCollection = presentation === 'collection'
  const [imageFailed, setImageFailed] = useState(false)
  const href = `/shop/product/${encodeURIComponent(product.productId)}`

  const handleNavigate = (event: MouseEvent<HTMLAnchorElement>) => {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return
    }

    event.preventDefault()
    onOpenDetail()
  }

  return (
    <article className="group min-w-0 text-left">
      <a
        href={href}
        onClick={handleNavigate}
        tabIndex={tabIndex}
        aria-hidden={ariaHidden}
        aria-label={`View ${product.name}`}
        className="block rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-black/25 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--sf-cream)]"
      >
        <div className="sf-product-card-image relative aspect-[4/5] w-full cursor-pointer overflow-hidden bg-[#eee4cc] transition-transform duration-200 active:scale-[0.985]">
          {displayImage && !imageFailed ? (
            <img
              src={displayImage}
              alt=""
              aria-hidden="true"
              loading="lazy"
              decoding="async"
              onError={() => setImageFailed(true)}
              className="h-full w-full object-cover object-center transition-transform duration-500 group-hover:scale-[1.025]"
            />
          ) : (
            <span className="absolute inset-0 grid place-items-center bg-[#eee4cc] px-4 text-center sf-type-2 font-medium text-black/42" aria-hidden="true">
              Fleurstales
            </span>
          )}

          {promoPercentLabel && (
            <span className="sf-promo-badge absolute left-3 top-3 z-[1] max-w-[75%] bg-[#f569a3] text-black sm:left-4 sm:top-4">
              {promoPercentLabel}
            </span>
          )}
        </div>

        <div
          className={isCollection ? 'mt-3 sm:mt-3.5' : 'mt-2.5 lg:mt-3.5'}
        >
          <h3
            title={product.name}
            className="sf-card-title sf-product-card-name truncate text-black"
          >
            {product.name}
          </h3>
          <div className="mt-0.5 flex flex-wrap items-baseline gap-x-1 gap-y-0.5">
            {product.originalPriceIdr && (
              <span className={isCollection ? 'sf-card-old-price text-black/42 line-through' : 'sf-type-1 text-black/45 line-through'}>
                {formatIdr(product.originalPriceIdr, formatter)}
              </span>
            )}
            <span className={isCollection ? 'sf-card-price text-black' : 'sf-type-2 font-medium leading-5 text-black'}>
              {hasVariants ? 'Starts from ' : ''}{formatIdr(displayPriceIdr, formatter)}
            </span>
          </div>
          {!isCollection && product.isCustomizable && (
            <span className="mt-1 block sf-type-1 leading-4 text-black/48 lg:leading-5">
              Customizable
            </span>
          )}
        </div>
      </a>
    </article>
  )
}

export default StorefrontProductCard
