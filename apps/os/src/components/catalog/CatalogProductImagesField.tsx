import { useEffect, useState, type FC } from 'react'
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'
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
  const [activeIndex, setActiveIndex] = useState(0)

  useEffect(() => {
    setActiveIndex((current) => Math.min(current, Math.max(ordered.length - 1, 0)))
  }, [ordered.length])

  const replaceAt = (index: number, value: string | undefined) => {
    if (!value) {
      const next = normalizeOrder(ordered.filter((_, imageIndex) => imageIndex !== index))
      onChange(next)
      setActiveIndex((current) => Math.min(current, Math.max(next.length - 1, 0)))
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
    const next = normalizeOrder([
      ...ordered,
      createLocalCatalogProductImage({
        id: generateId('img'),
        url: value,
        altText: productName?.trim() || undefined,
        sortOrder: index,
        isPrimary: index === 0,
      }),
    ])
    onChange(next)
    setActiveIndex(index)
  }

  const goPrevious = () => setActiveIndex((current) => current <= 0 ? ordered.length - 1 : current - 1)
  const goNext = () => setActiveIndex((current) => current >= ordered.length - 1 ? 0 : current + 1)
  const activeImage = ordered[activeIndex]

  return (
    <div className="space-y-3">
      {activeImage ? (
        <div className="space-y-3">
          <div className="relative w-fit max-w-full">
            <ImageDropInput
              key={activeImage.id}
              value={activeImage.url}
              onChange={(value) => replaceAt(activeIndex, value)}
              label={activeIndex === 0 ? 'Primary product photo' : `Gallery photo ${activeIndex + 1}`}
            />
            {ordered.length > 1 && (
              <>
                <button type="button" onClick={goPrevious} aria-label="Previous product photo" className="absolute left-2 top-[110px] inline-flex size-9 -translate-y-1/2 items-center justify-center rounded-full bg-background/95 text-foreground shadow-ios-sm ring-1 ring-border/70">
                  <ChevronLeft className="size-4" />
                </button>
                <button type="button" onClick={goNext} aria-label="Next product photo" className="absolute right-2 top-[110px] inline-flex size-9 -translate-y-1/2 items-center justify-center rounded-full bg-background/95 text-foreground shadow-ios-sm ring-1 ring-border/70">
                  <ChevronRight className="size-4" />
                </button>
              </>
            )}
          </div>

          {ordered.length > 1 && (
            <div className="flex max-w-[360px] gap-2 overflow-x-auto pb-1" aria-label="Product photo carousel">
              {ordered.map((image, index) => (
                <button key={image.id} type="button" onClick={() => setActiveIndex(index)} aria-label={`View product photo ${index + 1}`} className={`size-14 shrink-0 overflow-hidden rounded-lg bg-muted ring-2 ${index === activeIndex ? 'ring-primary' : 'ring-transparent'}`}>
                  <img src={image.url} alt={image.altText ?? `${productName ?? 'Product'} ${index + 1}`} className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          )}
          <p className="text-2xs text-muted-foreground">Photo {activeIndex + 1} of {ordered.length} · first photo is the storefront thumbnail.</p>
        </div>
      ) : (
        <ImageDropInput
          value={undefined}
          onChange={append}
          label="Primary product photo"
        />
      )}

      {ordered.length > 0 && ordered.length < CATALOG_IMAGE_MAX_COUNT && (
        <div className="space-y-1.5 border-t border-border/60 pt-3">
          <ImageDropInput
            value={undefined}
            onChange={append}
            label="Add gallery photo"
          />
          <p className="flex max-w-[360px] items-center gap-1.5 text-2xs text-muted-foreground">
            <Plus className="size-3" /> Up to {CATALOG_IMAGE_MAX_COUNT} ordered product photos.
          </p>
        </div>
      )}
    </div>
  )
}
