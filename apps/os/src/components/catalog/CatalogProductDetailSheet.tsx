/**
 * @file CatalogProductDetailSheet.tsx
 * @description Detail popup for a single catalog product, opened by tapping
 * a row in the Product Catalog list. Shows image carousel, description,
 * pricing, variants, and flags, plus Edit / Archive actions.
 */

import { useEffect, useState, type FC } from 'react'
import { Archive, ArchiveRestore, ChevronLeft, ChevronRight, ImageOff, Pencil, X } from 'lucide-react'
import type { CatalogProduct } from '../../store/catalogStoreTypes'
import { useCatalogStore } from '../../store/catalogStore'
import { getDisplayPriceIdr } from '../../domain/catalogDomain'
import { parseCatalogVariantLabel } from '../../domain/catalogVariantLabelDomain'
import { getDefaultCatalogSizeGuide, resolveCatalogSizeGuide } from '../../store/catalogStoreSizeGuideActions'

export interface CatalogProductDetailSheetProps {
  open: boolean
  product: CatalogProduct | null
  formatter: Intl.NumberFormat
  onClose: () => void
  onEditRequest: () => void
  onToggleActive: (isActive: boolean) => void
  canEdit?: boolean
}

export const CatalogProductDetailSheet: FC<CatalogProductDetailSheetProps> = ({
  open,
  product,
  formatter,
  onClose,
  onEditRequest,
  onToggleActive,
  canEdit = true,
}) => {
  const [activeImageIndex, setActiveImageIndex] = useState(0)
  const sizeGuideTemplates = useCatalogStore((state) => state.sizeGuideTemplates)
  const sizeGuideTargets = useCatalogStore((state) => state.sizeGuideTargets)

  const images = product
    ? product.images?.length
      ? [...product.images].sort((a, b) => a.sortOrder - b.sortOrder).map((image) => ({ id: image.id, url: image.url, alt: image.altText ?? product.name }))
      : (product.gallery?.length ? product.gallery : product.thumbnail ? [product.thumbnail] : []).map((url, index) => ({ id: `legacy-${index}`, url, alt: product.name }))
    : []

  useEffect(() => {
    setActiveImageIndex(0)
  }, [product?.id])

  useEffect(() => {
    setActiveImageIndex((current) => Math.min(current, Math.max(images.length - 1, 0)))
  }, [images.length])

  if (!open || !product) return null

  const displayPriceIdr = getDisplayPriceIdr(product)
  const sizeTemplate = resolveCatalogSizeGuide(product, sizeGuideTemplates, sizeGuideTargets, { includeLogical: true })
    ?? getDefaultCatalogSizeGuide(sizeGuideTemplates)
  const activeImage = images[activeImageIndex]
  const goPrevious = () => setActiveImageIndex((current) => current <= 0 ? images.length - 1 : current - 1)
  const goNext = () => setActiveImageIndex((current) => current >= images.length - 1 ? 0 : current + 1)

  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-black/32 backdrop-blur-[2px] sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        className="animate-sheet-up max-h-[97vh] w-full overflow-y-auto rounded-t-2xl border border-border/60 bg-card shadow-ios-lg sm:h-[min(94vh,980px)] sm:w-[calc(100vw-2rem)] sm:max-w-6xl sm:rounded-2xl xl:max-w-7xl"
      >
        <div className="flex items-start justify-between gap-2 border-b border-border/70 px-5 py-3.5 md:px-6 md:py-4">
          <div className="space-y-0.5">
            <h2 className="text-lg font-semibold leading-6 text-foreground">{product.name}</h2>
            <p className="text-xs text-muted-foreground">
              {product.productId} · {product.category} · {product.material === 'fresh' ? 'Fresh' : 'Artificial'}
              {!product.isActive && ' · Archived'}
            </p>
          </div>
          <button type="button" onClick={onClose} className="tap-scale inline-flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted/70 hover:text-foreground" aria-label="Close product detail">
            <X className="size-4" />
          </button>
        </div>

        <div className="space-y-4 px-5 py-5 md:grid md:grid-cols-[minmax(22rem,0.95fr)_minmax(28rem,1.05fr)] md:items-start md:gap-6 md:space-y-0 md:px-6 md:py-6">
          <div className="min-w-0 space-y-3">
            <div className="group relative aspect-square w-full overflow-hidden rounded-2xl bg-muted ring-1 ring-border/60">
              {activeImage ? (
                <img src={activeImage.url} alt={activeImage.alt} className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-muted-foreground/40"><ImageOff className="size-10" /></div>
              )}
              {images.length > 1 && (
                <>
                  <button type="button" onClick={goPrevious} aria-label="Previous product photo" className="absolute left-3 top-1/2 inline-flex size-11 -translate-y-1/2 items-center justify-center rounded-full bg-background/95 text-foreground shadow-ios-sm ring-1 ring-border/70 transition hover:bg-background">
                    <ChevronLeft className="size-5" />
                  </button>
                  <button type="button" onClick={goNext} aria-label="Next product photo" className="absolute right-3 top-1/2 inline-flex size-11 -translate-y-1/2 items-center justify-center rounded-full bg-background/95 text-foreground shadow-ios-sm ring-1 ring-border/70 transition hover:bg-background">
                    <ChevronRight className="size-5" />
                  </button>
                  <span className="absolute bottom-3 right-3 rounded-full bg-black/60 px-2.5 py-1 text-2xs font-semibold text-white">{activeImageIndex + 1} / {images.length}</span>
                </>
              )}
            </div>
            {images.length > 1 && (
              <div className="flex gap-2 overflow-x-auto pb-1" aria-label="Product image carousel">
                {images.map((image, index) => (
                  <button key={image.id} type="button" onClick={() => setActiveImageIndex(index)} className={`aspect-square w-16 shrink-0 overflow-hidden rounded-xl ring-2 transition ${index === activeImageIndex ? 'ring-primary' : 'ring-transparent hover:ring-border'}`} aria-label={`View product photo ${index + 1}`}>
                    <img src={image.url} alt="" className="h-full w-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-3">
            {product.description && <p className="text-sm text-muted-foreground">{product.description}</p>}

            <section className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-xl bg-muted px-3 py-3 text-xs">
              <div><p className="text-2xs font-semibold text-muted-foreground">Main occasion</p><p className="mt-0.5 font-medium text-foreground">{product.category}</p></div>
              <div><p className="text-2xs font-semibold text-muted-foreground">Arrangement type</p><p className="mt-0.5 font-medium text-foreground">{product.productType ?? '—'}</p></div>
              <div><p className="text-2xs font-semibold text-muted-foreground">Collection / Series</p><p className="mt-0.5 font-medium text-foreground">{product.collectionSeries ?? '—'}</p></div>
              <div><p className="text-2xs font-semibold text-muted-foreground">Pricing / Order type</p><p className="mt-0.5 font-medium text-foreground">{product.pricingType ?? 'Fixed'} · {product.orderType ?? 'Catalog'}</p></div>
              <div className="col-span-2"><p className="text-2xs font-semibold text-muted-foreground">Occasion tags</p><p className="mt-0.5 font-medium text-foreground">{(product.occasionTags?.length ? product.occasionTags : [product.category]).join(' · ')}</p></div>
            </section>

            <section className="rounded-xl bg-muted px-3 py-2">
              <p className="text-2xs font-semibold text-muted-foreground">From</p>
              <p className="text-sm font-semibold leading-5 text-foreground">
                {product.originalPriceIdr && <span className="mr-1.5 text-2xs text-muted-foreground line-through">{formatter.format(product.originalPriceIdr)}</span>}
                {formatter.format(displayPriceIdr)}
              </p>
              {product.promoLabel && <p className="text-2xs text-destructive">{product.promoLabel}</p>}
            </section>

            <section className="space-y-2 rounded-xl bg-muted px-3 py-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-2xs font-semibold text-muted-foreground">Variants</p>
                {sizeTemplate && <span className="rounded-full bg-primary/10 px-2.5 py-1 text-2xs font-semibold text-primary">Panduan ukuran · {sizeTemplate.name}</span>}
              </div>
              <div className="space-y-2">
                {product.variants.map((variant) => {
                  const parts = parseCatalogVariantLabel(variant.size)
                  return (
                    <div key={variant.id} className="flex items-center justify-between gap-3 rounded-lg bg-background/55 px-3 py-2 text-sm">
                      <div className="min-w-0">
                        <p className="truncate font-medium text-foreground/90">{sizeTemplate ? `${sizeTemplate.name} · ${parts.size || '—'}` : parts.size || variant.size}</p>
                        {parts.option && <p className="truncate text-xs text-foreground/75">Variant: {parts.option}</p>}
                        <p className="truncate text-2xs text-muted-foreground">{variant.sku}{variant.status === 'inactive' ? ' · Inactive' : ''}</p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="font-medium text-foreground">{formatter.format(variant.price)}</p>
                        {variant.cost !== undefined && <p className="text-2xs text-muted-foreground">Cost {formatter.format(variant.cost)}</p>}
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>

            <div className="flex flex-wrap gap-1.5">
              {product.isFeatured && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-2xs font-medium text-primary ring-1 ring-primary/15">Featured</span>}
              {product.isCustomizable && <span className="rounded-full bg-surface-neutral px-2 py-0.5 text-2xs font-medium text-foreground ring-1 ring-border/80">Customizable</span>}
            </div>
          </div>
        </div>

        {canEdit && (
          <div className="sticky bottom-0 flex items-center justify-between gap-2 border-t border-border bg-card/95 px-5 py-3 backdrop-blur md:px-6 md:py-4">
            <button type="button" onClick={() => onToggleActive(!product.isActive)} className="inline-flex h-11 items-center gap-2 rounded-full px-[18px] text-sm font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground">
              {product.isActive ? <><Archive className="size-3.5" />Archive</> : <><ArchiveRestore className="size-3.5" />Unarchive</>}
            </button>
            <button type="button" onClick={onEditRequest} className="inline-flex h-11 items-center gap-2 rounded-full bg-primary px-[18px] text-sm font-medium text-white shadow-ios-sm transition hover:bg-primary/90">
              <Pencil className="size-3.5" />Edit product
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

export default CatalogProductDetailSheet
