import { useMemo, useState, type FC } from 'react'
import { AlertCircle, CheckCircle2, Link2, Pencil, Plus, Ruler } from 'lucide-react'
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

  const unlinked = variants
    .map((variant, index) => ({ variant, index }))
    .filter(({ variant }) => !variant.sizeOptionId)
  const incompatible = variants
    .map((variant, index) => ({ variant, index }))
    .filter(({ variant }) => Boolean(variant.sizeOptionId) && !sizeById.has(variant.sizeOptionId as string))

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

  const openNewUnlinked = () => {
    setEditorTarget({
      index: null,
      variant: blankVariant(),
      label: 'Tambah varian belum ditautkan',
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
            Template hanya menampilkan slot ukuran. Varian baru dibuat dan disimpan setelah Anda mengaturnya.
          </p>
        </div>
        <div className="rounded-full bg-muted px-3 py-1.5 text-xs font-medium text-muted-foreground">
          {variants.length} varian tersimpan di draft
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
                          {archived ? <span className="rounded-full bg-muted px-2 py-1 text-2xs text-muted-foreground">Diarsipkan</span> : null}
                        </div>
                        {configured && variant ? (
                          <>
                            <p className="mt-1 text-sm font-medium text-foreground">{formatPrice(variant.price)}</p>
                            <p className="mt-1 text-xs text-muted-foreground">{statusBadge(variant)}{variant.sku ? ' · ' + variant.sku : ''}</p>
                          </>
                        ) : (
                          <p className="mt-2 text-xs leading-5 text-muted-foreground">Belum dikonfigurasi untuk produk ini.</p>
                        )}
                      </div>
                      {configured ? <CheckCircle2 className="size-5 shrink-0 text-success" /> : <span className="size-5 shrink-0 rounded-full border border-dashed border-border" />}
                    </div>

                    <button
                      type="button"
                      disabled={archived && !configured}
                      onClick={() => configured && variantIndex !== undefined ? openExisting(variantIndex, 'Edit varian · ' + size.name) : openNewForSize(size.id)}
                      className="mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-full border border-border bg-card px-4 text-sm font-semibold text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {configured ? <Pencil className="size-4" /> : <Plus className="size-4" />}
                      {configured ? 'Edit varian' : archived ? 'Ukuran diarsipkan' : 'Atur varian'}
                    </button>
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
              <p className="text-sm font-semibold text-foreground">Belum ada template ukuran</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                Jenis rangkaian ini belum memiliki template ukuran yang ditetapkan. Varian lama tetap aman dan tidak akan ditautkan otomatis.
              </p>
            </div>
          </div>
        </div>
      )}

      {unlinked.length > 0 ? (
        <div className="space-y-3 rounded-2xl border border-warning/25 bg-warning/5 p-4">
          <div>
            <p className="flex items-center gap-2 text-sm font-semibold"><Link2 className="size-4 text-warning" /> Belum ditautkan ke ukuran</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              Data lama ini tetap disimpan apa adanya. Tautkan secara eksplisit jika sudah mengetahui ukuran template yang benar.
            </p>
          </div>
          <div className="space-y-2">
            {unlinked.map(({ variant, index }) => (
              <button
                key={variant.id ?? 'unlinked-' + index}
                type="button"
                onClick={() => openExisting(index)}
                id={`catalog-variant-${index}`}
                className={`flex min-h-12 w-full items-center justify-between gap-3 rounded-xl border bg-card px-3 py-2 text-left hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive/35 ${
                  validationErrorIndexes.has(index) ? 'border-destructive/45 ring-1 ring-destructive/25' : 'border-border'
                }`}
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold">{variant.size || 'Nama ukuran belum tersedia'}</span>
                  <span className="block text-xs text-muted-foreground">{formatPrice(variant.price)} · {statusBadge(variant)}</span>
                </span>
                <span className="shrink-0 text-xs font-semibold text-primary">Tinjau & tautkan</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {incompatible.length > 0 ? (
        <div className="space-y-3 rounded-2xl border border-destructive/20 bg-destructive/5 p-4">
          <div>
            <p className="text-sm font-semibold text-foreground">Ukuran tidak cocok dengan template saat ini</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              Varian ini tidak dihapus. Pilih ukuran template yang benar sebelum menjualnya kembali.
            </p>
          </div>
          {incompatible.map(({ variant, index }) => (
            <button
              key={variant.id ?? 'review-' + index}
              type="button"
              onClick={() => openExisting(index, 'Tinjau varian · ' + (variant.size || 'Tanpa ukuran'))}
              id={`catalog-variant-${index}`}
              className={`flex min-h-12 w-full items-center justify-between gap-3 rounded-xl border bg-card px-3 py-2 text-left hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive/35 ${
                validationErrorIndexes.has(index) ? 'border-destructive/45 ring-1 ring-destructive/25' : 'border-border'
              }`}
            >
              <span>
                <span className="block text-sm font-semibold">{variant.size || 'Tanpa ukuran'}</span>
                <span className="block text-xs text-muted-foreground">ID ukuran: {variant.sizeOptionId}</span>
              </span>
              <span className="text-xs font-semibold text-destructive">Perlu ditinjau</span>
            </button>
          ))}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-dashed border-border px-4 py-4">
        <div>
          <p className="text-sm font-semibold">Varian tanpa tautan ukuran</p>
          <p className="mt-1 text-xs text-muted-foreground">Gunakan hanya jika produk memang belum dapat memakai template ukuran.</p>
        </div>
        <button type="button" onClick={openNewUnlinked} className="inline-flex h-11 items-center gap-2 rounded-full border border-border bg-card px-4 text-sm font-semibold hover:bg-muted">
          <Plus className="size-4" /> Tambah varian
        </button>
      </div>

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
