import type { FC } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import type { CatalogVariantStatus } from '../../store/catalogStoreTypes'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select'
import type { VariantRow } from './CatalogItemFormSheet'

interface Props {
  variants: VariantRow[]
  updateVariant: (index: number, patch: Partial<VariantRow>) => void
  addVariant: () => void
  removeVariant: (index: number) => void
}

const inputClass =
  'h-11 w-full rounded-xl border border-border bg-card px-3.5 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary/50 focus:ring-2 focus:ring-primary/20'
const labelClass = 'text-sm font-medium text-foreground'

const VariantField = ({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) => (
  <div className="space-y-1.5">
    <label className={labelClass}>{label}</label>
    {children}
  </div>
)

export const CatalogVariantsSection: FC<Props> = ({
  variants,
  updateVariant,
  addVariant,
  removeVariant,
}) => (
  <section className="space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h3 className="text-base font-semibold text-foreground">Sellable sizes</h3>
        <p className="text-xs text-muted-foreground">SKU is generated automatically when a new size is saved.</p>
      </div>
      <button
        type="button"
        onClick={addVariant}
        className="inline-flex h-11 items-center gap-2 rounded-full bg-primary px-[18px] text-sm font-semibold text-primary-foreground"
      >
        <Plus className="size-4" />
        Add size
      </button>
    </div>

    <div className="space-y-3">
      {variants.map((row, index) => (
        <article
          key={row.id ?? `new-${index}`}
          className="rounded-2xl border border-border/80 bg-card p-4 shadow-ios-sm"
        >
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-foreground">Size {index + 1}</p>
              <p className="text-xs text-muted-foreground">{row.sku || 'SKU generated on save'}</p>
            </div>
            {variants.length > 1 && (
              <button
                type="button"
                onClick={() => removeVariant(index)}
                aria-label={`Remove size ${index + 1}`}
                className="inline-flex size-11 items-center justify-center rounded-full text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive"
              >
                <Trash2 className="size-4" />
              </button>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <VariantField label="Size name · Required">
              <input
                value={row.size}
                onChange={(event) => updateVariant(index, { size: event.target.value })}
                placeholder="Example: 05R"
                className={inputClass}
              />
            </VariantField>

            <VariantField label="Status · Required">
              <Select
                value={row.status}
                onValueChange={(value) =>
                  updateVariant(index, { status: value as CatalogVariantStatus })
                }
              >
                <SelectTrigger className={inputClass}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </VariantField>

            <VariantField label="Selling price · Required">
              <input
                type="number"
                min={1}
                inputMode="numeric"
                value={row.price}
                onChange={(event) => updateVariant(index, { price: event.target.value })}
                placeholder="Rp0"
                className={inputClass}
              />
            </VariantField>

            <VariantField label="Cost">
              <input
                type="number"
                min={0}
                inputMode="numeric"
                value={row.cost}
                onChange={(event) => updateVariant(index, { cost: event.target.value })}
                placeholder="Optional"
                className={inputClass}
              />
            </VariantField>
          </div>
        </article>
      ))}
    </div>
  </section>
)
