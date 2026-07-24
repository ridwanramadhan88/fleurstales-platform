import type { FC } from 'react'
import type { CatalogProduct } from '../../store/catalogStoreTypes'
import { getDisplayPriceIdr, getPromoPercentLabel } from '../../domain/catalogDomain'
import { getStorefrontProductThumbnail } from './storefrontProductImages'

export interface StorefrontProductCardProps {
  product: CatalogProduct
  formatter: Intl.NumberFormat
  onOpenDetail: () => void
  presentation?: 'default' | 'collection'
}

export const StorefrontProductCard: FC<StorefrontProductCardProps> = ({
  product,
  formatter,
  onOpenDetail,
  presentation = 'default',
}) => {
  const displayPriceIdr = getDisplayPriceIdr(product)
  const hasVariants = product.variants.length > 1
  const promoPercentLabel = getPromoPercentLabel(product, displayPriceIdr)
  const displayImage = getStorefrontProductThumbnail(product)
  const isCollection = presentation === 'collection'

  return (
    <article className="group min-w-0 text-left">
      <div
        role="button"
        tabIndex={0}
        onClick={onOpenDetail}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            onOpenDetail()
          }
        }}
        aria-label={`View ${product.name}`}
        className="sf-product-card-image relative aspect-[4/5] w-full cursor-pointer overflow-hidden bg-[#eee4cc] outline-none transition-transform duration-200 active:scale-[0.985] focus-visible:ring-2 focus-visible:ring-black/25"
      >
        <img
          src={displayImage}
          alt=""
          aria-hidden="true"
          className="h-full w-full object-cover object-center transition-transform duration-500 group-hover:scale-[1.025]"
        />

        {promoPercentLabel && (
          <span className="sf-promo-badge absolute left-3 top-3 z-[1] max-w-[75%] bg-[#f569a3] text-black sm:left-4 sm:top-4">
            {promoPercentLabel}
          </span>
        )}
      </div>

      <button
        type="button"
        onClick={onOpenDetail}
        className={`block w-full rounded-lg text-left outline-none focus-visible:ring-2 focus-visible:ring-black/20 ${
          isCollection ? 'mt-3 sm:mt-3.5' : 'mt-2.5 lg:mt-3.5'
        }`}
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
              Rp. {formatter.format(product.originalPriceIdr)}
            </span>
          )}
          <span className={isCollection ? 'sf-card-price text-black' : 'sf-type-2 font-medium leading-5 text-black'}>
            {hasVariants ? 'From Rp. ' : 'Rp. '}
            {formatter.format(displayPriceIdr)}
          </span>
        </div>
        {!isCollection && product.isCustomizable && (
          <span className="mt-1 block sf-type-1 leading-4 text-black/48 lg:leading-5">
            Customizable
          </span>
        )}
      </button>
    </article>
  )
}

export default StorefrontProductCard
