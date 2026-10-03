import { useMemo, useState, type FC } from 'react'
import { AlertCircle, CheckCircle2, Pencil, Plus, Ruler, Trash2 } from 'lucide-react'
import type { CatalogSizeGuideTemplate } from '../../store/catalogStoreTypes'
import type { VariantRow } from './CatalogItemFormSheet'
import { CatalogVariantEditorDialog } from './CatalogVariantEditorDialog'

interface Props {
  variants: VariantRow[]
  sizeTemplate?: CatalogSizeGuideTemplate
  updateVariant: (index: number, patch: Partial<VariantRow>) => void
  addVariant: (variant?: VariantRow) => void
  removeVariant: (index: number) => void
  productName?: string
  validationErrorIndexes?: Set<number>
}

interface EditorTarget {
  index: number | null
  variant: VariantRow
  label: string
}

const formatPrice = (value: string): string => {
  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed)) return 'Harga belum diatur'
  return 'Rp' + new Intl.NumberFormat('id-ID').format(parsed)
}

const statusBadge = (variant: VariantRow): string =>
  variant.status === 'active' ? 'Dijual' : 'Tidak tersedia'

const EMPTY_VALIDATION_ERROR_INDEXES = new Set<number>()

const blankVariant = (): VariantRow => ({
  size: '',
  images: [],
  price: '',
  cost: '',
  status: 'active',
  flowerRecipe: [],
})

export const CatalogVariantsSection: FC<Props> = ({
  variants,
  sizeTemplate,
  updateVariant,
  addVariant,
  removeVariant,
  productName,
  validationErrorIndexes = EMPTY_VALIDATION_ERROR_INDEXES,
}) => {
  const [editorTarget, setEditorTarget] = useState<EditorTarget | null>(null)

  const templateSizes = useMemo(
    () => [...(sizeTemplate?.sizes ?? [])].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)),
    [sizeTemplate],
  )
  const sizeById = useMemo(() => new Map(templateSizes.map((size) => [size.id, size])), [templateSizes])
  const variantIndexBySize = useMemo(() => {
    const map = new Map<string, number>()
    variants.forEach((variant, index) => {
      if (variant.sizeOptionId) map.set(variant.sizeOptionId, index)
    })
    return map
  }, [variants])

  // Variants whose size is not in the chosen chart: older unlinked variants, or sizes
  // from the previously chosen chart that had no same-named size in the new one.
  const needsSize = variants
    .map((variant, index) => ({ variant, index }))
    .filter(({ variant }) => !variant.sizeOptionId || !sizeById.has(variant.sizeOptionId))
  const usedSizeIds = new Set(variants.map((variant) => variant.sizeOptionId).filter((id): id is string => Boolean(id)))
  const replacementSizes = templateSizes.filter((size) => size.isActive !== false && !usedSizeIds.has(size.id))

  const openExisting = (index: number, label?: string) => {
    const variant = variants[index]
    if (!variant) return
    setEditorTarget({
      index,
      variant: structuredClone(variant),
      label: label ?? ('Varian · ' + (variant.size || 'Belum ditautkan')),
    })
  }

  const openNewForSize = (sizeId: string) => {
    const size = sizeById.get(sizeId)
    if (!size || size.isActive === false) return
    setEditorTarget({
      index: null,
      variant: { ...blankVariant(), sizeOptionId: size.id, size: size.name },
      label: 'Atur varian · ' + size.name,
    })
  }

  const reservedSizeOptionIds = useMemo(() => {
    const currentId = editorTarget?.variant.sizeOptionId
    return new Set(
      variants
        .map((variant) => variant.sizeOptionId)
        .filter((id): id is string => Boolean(id) && id !== currentId),
    )
  }, [editorTarget?.variant.sizeOptionId, variants])

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-foreground">Varian berdasarkan ukuran</h3>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">
            Pilih hanya ukuran yang memang dijual oleh produk ini. Ukuran yang tidak ditambahkan tidak akan muncul di Storefront.
          </p>
        </div>
        <div className="rounded-full bg-muted px-3 py-1.5 text-xs font-medium text-muted-foreground">
          {variants.length} ukuran dipakai produk
        </div>
      </div>

      {sizeTemplate ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Ruler className="size-4 text-primary" />
            <span>{sizeTemplate.name}</span>
          </div>

          {templateSizes.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
              Template ini belum memiliki ukuran.
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {templateSizes.map((size) => {
                const variantIndex = variantIndexBySize.get(size.id)
                const variant = variantIndex === undefined ? undefined : variants[variantIndex]
                const configured = Boolean(variant)
                const archived = size.isActive === false
                return (
                  <article
                    key={size.id}
                    id={configured && variantIndex !== undefined ? `catalog-variant-${variantIndex}` : undefined}
                    tabIndex={configured && variantIndex !== undefined ? -1 : undefined}
                    className={`rounded-2xl border bg-card p-4 shadow-ios-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive/35 ${
                      configured && variantIndex !== undefined && validationErrorIndexes.has(variantIndex)
                        ? 'border-destructive/45 ring-1 ring-destructive/25'
                        : 'border-border/80'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-semibold text-foreground">{size.name}</p>
                          <span className={configured
                            ? 'rounded-full bg-success/10 px-2 py-1 text-2xs font-medium text-success'
                            : 'rounded-full bg-muted px-2 py-1 text-2xs font-medium text-muted-foreground'}
                          >
                            {configured ? 'Dipakai produk' : 'Tidak dipakai'}
                          </span>
                          {archived ? <span className="rounded-full bg-muted px-2 py-1 text-2xs text-muted-foreground">Diarsipkan</span> : null}
                        </div>
                        {configured && variant ? (
                          <>
                            <p className="mt-1 text-sm font-medium text-foreground">{formatPrice(variant.price)}</p>
                            <p className="mt-1 text-xs text-muted-foreground">{statusBadge(variant)}{variant.sku ? ' · ' + variant.sku : ''}</p>
                            <p className="mt-2 text-2xs leading-4 text-muted-foreground">
                              {variant.images.length > 0 ? 'Foto ukuran siap' : 'Memakai foto katalog'} · {variant.flowerRecipe.length > 0 ? variant.flowerRecipe.length + ' item resep' : 'Resep belum ada'}
                            </p>
                          </>
                        ) : (
                          <p className="mt-2 text-xs leading-5 text-muted-foreground">Ukuran ini belum ditambahkan ke produk.</p>
                        )}
                      </div>
                      {configured ? <CheckCircle2 className="size-5 shrink-0 text-success" /> : <span className="size-5 shrink-0 rounded-full border border-dashed border-border" />}
                    </div>

                    {configured && variantIndex !== undefined ? (
                      <div className="mt-4 grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => openExisting(variantIndex, 'Edit varian · ' + size.name)}
                          className="inline-flex h-11 items-center justify-center gap-2 rounded-full border border-border bg-card px-3 text-sm font-semibold text-foreground transition hover:bg-muted"
                        >
                          <Pencil className="size-4" />
                          Edit varian
                        </button>
                        <button
                          type="button"
                          onClick={() => removeVariant(variantIndex)}
                          className="inline-flex h-11 items-center justify-center gap-2 rounded-full border border-destructive/20 bg-card px-3 text-sm font-semibold text-destructive transition hover:bg-destructive/5"
                        >
                          <Trash2 className="size-4" />
                          Hapus
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        disabled={archived}
                        onClick={() => openNewForSize(size.id)}
                        className="mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-full border border-border bg-card px-4 text-sm font-semibold text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <Plus className="size-4" />
                        {archived ? 'Ukuran diarsipkan' : 'Tambahkan ke produk'}
                      </button>
                    )}
                  </article>
                )
              })}
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-2xl border border-warning/25 bg-warning/5 px-4 py-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 size-5 shrink-0 text-warning" />
            <div>
              <p className="text-sm font-semibold text-foreground">Template ukuran belum dipilih</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                Pilih template ukuran untuk produk ini. Varian lama tetap aman dan tidak akan ditautkan otomatis.
              </p>
            </div>
          </div>
        </div>
      )}

      {needsSize.length > 0 ? (
        <div className="space-y-3 rounded-2xl border border-border bg-muted/35 p-4">
          <div>
            <p className="text-sm font-semibold text-foreground">Pilih ukuran baru</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              {sizeTemplate
                ? 'Ukuran berikut belum ada di template ' + sizeTemplate.name + '. Pilih ukuran penggantinya, atau hapus jika tidak dijual lagi.'
                : 'Pilih template ukuran terlebih dahulu, lalu pilih ukuran untuk varian berikut.'}
            </p>
          </div>
          <div className="space-y-2">
            {needsSize.map(({ variant, index }) => (
              <div
                key={variant.id ?? 'needs-size-' + index}
                id={`catalog-variant-${index}`}
                tabIndex={-1}
                className={`grid gap-2 rounded-xl border bg-card p-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive/35 sm:grid-cols-[minmax(0,1fr)_minmax(0,14rem)_auto] sm:items-center ${
                  validationErrorIndexes.has(index) ? 'border-destructive/45 ring-1 ring-destructive/25' : 'border-border'
                }`}
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold">{variant.size || 'Tanpa ukuran'}</span>
                  <span className="block text-xs text-muted-foreground">{formatPrice(variant.price)} · {statusBadge(variant)}</span>
                </span>
                {sizeTemplate ? (
                  <select
                    aria-label={'Ukuran pengganti untuk ' + (variant.size || 'varian ini')}
                    value=""
                    onChange={(event) => {
                      const size = sizeById.get(event.target.value)
                      if (size) updateVariant(index, { sizeOptionId: size.id, size: size.name })
                    }}
                    className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground"
                  >
                    <option value="">Pilih ukuran</option>
                    {replacementSizes.map((size) => <option key={size.id} value={size.id}>{size.name}</option>)}
                  </select>
                ) : <span />}
                <button
                  type="button"
                  aria-label={'Hapus ' + (variant.size || 'varian ini')}
                  onClick={() => removeVariant(index)}
                  className="inline-flex h-11 items-center justify-center gap-1.5 rounded-full px-3 text-sm font-medium text-destructive hover:bg-destructive/10"
                >
                  <Trash2 className="size-4" /> Hapus
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {!sizeTemplate ? (
        <div className="rounded-2xl border border-dashed border-border px-4 py-4 text-sm text-muted-foreground">
          Pilih template ukuran di atas untuk menambahkan ukuran ke produk ini.
        </div>
      ) : null}

      {editorTarget ? (
        <CatalogVariantEditorDialog
          open
          onOpenChange={(open) => { if (!open) setEditorTarget(null) }}
          variant={editorTarget.variant}
          variantLabel={editorTarget.label}
          productName={productName}
          sizeTemplate={sizeTemplate}
          reservedSizeOptionIds={reservedSizeOptionIds}
          onApply={(next) => {
            if (editorTarget.index === null) addVariant(next)
            else updateVariant(editorTarget.index, next)
            setEditorTarget(null)
          }}
          onDelete={editorTarget.index === null ? undefined : () => {
            removeVariant(editorTarget.index as number)
            setEditorTarget(null)
          }}
        />
      ) : null}
    </section>
  )
}
