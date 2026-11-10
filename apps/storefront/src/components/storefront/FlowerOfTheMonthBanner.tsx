import { useState, type FC } from 'react'
import type { CatalogProduct } from '../../store/catalogStoreTypes'
import { getStorefrontProductThumbnail } from './storefrontProductImages'
import { getDisplayPriceIdr } from '../../domain/catalogDomain'
import { formatIdr } from '../../lib/currency'

interface Props {
  product: CatalogProduct
  formatter: Intl.NumberFormat
  note?: string | null
  onOpen: (productId: string) => void
}

/** The month's single hand-picked flower: photo on the left, label and name on the right. */
export const FlowerOfTheMonthBanner: FC<Props> = ({ product, formatter, note, onOpen }) => {
  const [imageFailed, setImageFailed] = useState(false)
  const image = getStorefrontProductThumbnail(product)
  const price = getDisplayPriceIdr(product)

  return (
    <section aria-label="Flower of the Month">
      <button type="button" className="sf-fotm" onClick={() => onOpen(product.id)}>
        <span className="sf-fotm__photo">
          {image && !imageFailed ? (
            <img src={image} alt="" aria-hidden="true" decoding="async" onError={() => setImageFailed(true)} />
          ) : (
            <span aria-hidden="true" className="absolute inset-0 grid place-items-center px-3 text-center sf-type-2 font-medium text-black/42">
              Fleurstales
            </span>
          )}
        </span>
        <span className="sf-fotm__body">
          <span className="sf-fotm__eyebrow">Flower of the Month</span>
          <span className="sf-fotm__name font-display">{product.name}</span>
          {note && <span className="sf-fotm__note">{note}</span>}
          {price > 0 && <span className="sf-fotm__price">{formatIdr(price, formatter)}</span>}
        </span>
      </button>
    </section>
  )
}
