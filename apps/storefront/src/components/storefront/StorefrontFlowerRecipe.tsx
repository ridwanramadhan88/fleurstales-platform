import type { FC } from 'react'
import type { CatalogVariant } from '../../store/catalogStoreTypes'

interface StorefrontFlowerRecipeProps {
  variant?: CatalogVariant
  showSelectionHint?: boolean
  compact?: boolean
}

const unitLabel = (unit: 'stem' | 'bunch', quantity: number): string => {
  if (unit === 'bunch') return quantity === 1 ? 'ikat' : 'ikat'
  return quantity === 1 ? 'tangkai' : 'tangkai'
}

export const StorefrontFlowerRecipe: FC<StorefrontFlowerRecipeProps> = ({
  variant,
  showSelectionHint = false,
  compact = false,
}) => {
  const recipe = variant?.flowerRecipe ?? []

  if (!variant && !showSelectionHint) return null
  if (variant && recipe.length === 0) return null

  return (
    <section
      className={compact ? 'space-y-2' : 'rounded-[var(--sf-radius-field)] border border-black/10 bg-white/35 p-4 sm:p-5'}
      aria-labelledby={compact ? undefined : 'storefront-flower-recipe-heading'}
    >
      <div className="flex items-center justify-between gap-3">
        <h2
          id={compact ? undefined : 'storefront-flower-recipe-heading'}
          className={compact ? 'sf-label text-black/50' : 'sf-type-2 font-semibold text-black'}
          data-no-translate
        >
          Resep Bunga
        </h2>
        {variant ? <span className="sf-type-1 text-black/40">{variant.size}</span> : null}
      </div>

      {!variant ? (
        <p className="sf-type-2 text-black/48">Pilih ukuran untuk melihat Resep Bunga.</p>
      ) : (
        <dl className={compact ? 'space-y-1.5' : 'mt-3 divide-y divide-black/10'}>
          {recipe.map((item) => (
            <div
              key={item.id}
              className={compact ? 'flex items-baseline justify-between gap-4' : 'flex items-baseline justify-between gap-4 py-2.5 first:pt-0 last:pb-0'}
            >
              <dt className="sf-type-2 font-medium text-black/72">{item.flowerName}</dt>
              <dd className="shrink-0 sf-type-2 text-black/52">
                {item.quantity} {unitLabel(item.unit, item.quantity)}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  )
}

export default StorefrontFlowerRecipe
