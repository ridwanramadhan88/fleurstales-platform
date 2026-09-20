import type { FC } from 'react'
import type { CatalogProductImage } from '../../store/catalogStoreTypes'
import {
  CATALOG_EDITOR_IMAGE_MAX_COUNT,
  createLocalCatalogProductImage,
} from '../../domain/catalogImageDomain'
import { generateId } from '../../lib/id'
import { ImageDropInput } from './ImageDropInput'

interface Props {
  images: CatalogProductImage[]
  onChange: (images: CatalogProductImage[]) => void
  productName?: string
  kind?: 'catalog' | 'variant'
}

const normalizeOrder = (images: CatalogProductImage[]): CatalogProductImage[] =>
  images.slice(0, CATALOG_EDITOR_IMAGE_MAX_COUNT).map((image, index) => ({
    ...image,
    sortOrder: index,
    isPrimary: index === 0,
  }))

export const CatalogProductImagesField: FC<Props> = ({
  images,
  onChange,
  productName,
  kind = 'catalog',
}) => {
  const ordered = normalizeOrder(images)
  const activeImage = ordered[0]
  const isVariant = kind === 'variant'
  const fieldTitle = isVariant ? 'Foto varian' : 'Foto katalog'
  const inputLabel = isVariant ? 'Foto varian ukuran' : 'Foto katalog default'

  const replace = (value: string | undefined) => {
    if (!value) {
      onChange([])
      return
    }

    if (activeImage?.url === value) return

    onChange([createLocalCatalogProductImage({
      id: generateId('img'),
      url: value,
      altText: productName?.trim() || activeImage?.altText,
      sortOrder: 0,
      isPrimary: true,
    })])
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-medium text-foreground">{fieldTitle}</p>
        <span className="text-2xs text-muted-foreground">{ordered.length}/{CATALOG_EDITOR_IMAGE_MAX_COUNT}</span>
      </div>

      <ImageDropInput
        key={activeImage?.id ?? kind}
        value={activeImage?.url}
        onChange={replace}
        label={inputLabel}
      />

      <p className="max-w-[360px] text-2xs leading-4 text-muted-foreground">
        {isVariant
          ? 'Maksimal 1 foto untuk ukuran ini. Foto ini dipakai saat ukuran dipilih di Storefront.'
          : 'Maksimal 1 foto. Ini menjadi foto default katalog dan foto pertama saat detail produk dibuka. Foto varian diatur per ukuran.'}
      </p>
    </div>
  )
}
