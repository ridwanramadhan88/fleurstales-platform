import type { FC } from 'react'
import { Flower2, Plus, Trash2 } from 'lucide-react'
import type { CatalogVariantStatus } from '../../store/catalogStoreTypes'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select'
import type { VariantRow } from './CatalogItemFormSheet'
import { generateId } from '../../lib/id'

interface Props {
  variants: VariantRow[]
  updateVariant: (index: number, patch: Partial<VariantRow>) => void
  addVariant: () => void
  removeVariant: (index: number) => void
}

const updateFlowerRecipe = (
  row: VariantRow,
  updateVariant: Props['updateVariant'],
  variantIndex: number,
  recipeIndex: number,
  patch: Partial<VariantRow['flowerRecipe'][number]>,
) => {
  updateVariant(variantIndex, {
    flowerRecipe: row.flowerRecipe.map((item, index) =>
      index === recipeIndex ? { ...item, ...patch } : item,
    ),
  })
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

          <div className="mt-5 border-t border-border/70 pt-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <Flower2 className="size-4 text-primary" />
                  Flower Recipe
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">Flowers only. Add the standard flower composition for this size.</p>
              </div>
              <button
                type="button"
                onClick={() => updateVariant(index, {
                  flowerRecipe: [
                    ...row.flowerRecipe,
                    { id: generateId('flower_recipe'), flowerName: '', quantity: '1', unit: 'stem' },
                  ],
                })}
                className="inline-flex h-9 items-center gap-1.5 rounded-full border border-border bg-card px-3 text-xs font-semibold text-foreground hover:bg-muted"
              >
                <Plus className="size-3.5" />
                Add flower
              </button>
            </div>

            {row.flowerRecipe.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
                No flower recipe yet.
              </div>
            ) : (
              <div className="space-y-2">
                {row.flowerRecipe.map((item, recipeIndex) => (
                  <div key={item.id} className="grid gap-2 rounded-xl bg-muted/45 p-3 sm:grid-cols-[minmax(0,1fr)_7rem_8rem_2.75rem] sm:items-end">
                    <VariantField label="Flower">
                      <input
                        value={item.flowerName}
                        onChange={(event) => updateFlowerRecipe(row, updateVariant, index, recipeIndex, { flowerName: event.target.value })}
                        placeholder="Example: Red Rose"
                        className={inputClass}
                      />
                    </VariantField>
                    <VariantField label="Qty">
                      <input
                        type="number"
                        min={0.01}
                        step={0.01}
                        inputMode="decimal"
                        value={item.quantity}
                        onChange={(event) => updateFlowerRecipe(row, updateVariant, index, recipeIndex, { quantity: event.target.value })}
                        className={inputClass}
                      />
                    </VariantField>
                    <VariantField label="Unit">
                      <Select
                        value={item.unit}
                        onValueChange={(value) => updateFlowerRecipe(row, updateVariant, index, recipeIndex, { unit: value as 'stem' | 'bunch' })}
                      >
                        <SelectTrigger className={inputClass}><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="stem">Stem</SelectItem>
                          <SelectItem value="bunch">Bunch</SelectItem>
                        </SelectContent>
                      </Select>
                    </VariantField>
                    <button
                      type="button"
                      onClick={() => updateVariant(index, {
                        flowerRecipe: row.flowerRecipe.filter((_, flowerIndex) => flowerIndex !== recipeIndex),
                      })}
                      aria-label={`Remove flower ${recipeIndex + 1}`}
                      className="inline-flex size-11 items-center justify-center rounded-full text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </article>
      ))}
    </div>
  </section>
)
