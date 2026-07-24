import type { FC } from 'react'
import { Plus } from 'lucide-react'
import type { CatalogProductImage } from '../../store/catalogStoreTypes'
import {
  CATALOG_IMAGE_MAX_COUNT,
  createLocalCatalogProductImage,
} from '../../domain/catalogImageDomain'
import { generateId } from '../../lib/id'
import { ImageDropInput } from './ImageDropInput'

interface Props {
  images: CatalogProductImage[]
  onChange: (images: CatalogProductImage[]) => void
  productName?: string
}

const normalizeOrder = (images: CatalogProductImage[]): CatalogProductImage[] =>
  images.slice(0, CATALOG_IMAGE_MAX_COUNT).map((image, index) => ({
    ...image,
    sortOrder: index,
    isPrimary: index === 0,
  }))

export const CatalogProductImagesField: FC<Props> = ({ images, onChange, productName }) => {
  const ordered = normalizeOrder(images)
  const replaceAt = (index: number, value: string | undefined) => {
    if (!value) {
      onChange(normalizeOrder(ordered.filter((_, imageIndex) => imageIndex !== index)))
      return
    }

    const existing = ordered[index]
    if (existing?.url === value) return

    // Replacing an image creates a new object identity. Never reuse the old
    // Storage path before the catalog revision is accepted, otherwise a stale
    // editor could overwrite the current binary even when metadata sync conflicts.
    const next = createLocalCatalogProductImage({
      id: generateId('img'),
      url: value,
      altText: productName?.trim() || existing?.altText,
      sortOrder: index,
      isPrimary: index === 0,
    })
    onChange(normalizeOrder(ordered.map((image, imageIndex) => imageIndex === index ? next : image)))
  }

  const append = (value: string | undefined) => {
    if (!value || ordered.length >= CATALOG_IMAGE_MAX_COUNT) return
    const index = ordered.length
    onChange(normalizeOrder([
      ...ordered,
      createLocalCatalogProductImage({
        id: generateId('img'),
        url: value,
        altText: productName?.trim() || undefined,
        sortOrder: index,
        isPrimary: index === 0,
      }),
    ]))
  }

  return (
    <div className="space-y-4">
      {ordered.map((image, index) => (
        <ImageDropInput
          key={image.id}
          value={image.url}
          onChange={(value) => replaceAt(index, value)}
          label={index === 0 ? 'Primary product photo' : `Gallery photo ${index + 1}`}
        />
      ))}

      {ordered.length < CATALOG_IMAGE_MAX_COUNT && (
        <div className="space-y-1.5">
          <ImageDropInput
            value={undefined}
            onChange={append}
            label={ordered.length === 0 ? 'Primary product photo' : 'Add gallery photo'}
          />
          {ordered.length > 0 && (
            <p className="flex max-w-[220px] items-center gap-1.5 text-2xs text-muted-foreground">
              <Plus className="size-3" /> Up to {CATALOG_IMAGE_MAX_COUNT} ordered product photos. The first image is the storefront thumbnail.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
