import type { FC } from 'react'
import type { CatalogMaterial } from '../../store/catalogStoreTypes'
import type { CatalogSubCategoryFilter } from '../../domain/catalogDomain'

const SUBCATEGORY_LABELS: Record<CatalogMaterial, string> = {
  fresh: 'Fresh Flowers',
  artificial: 'Artificial Flowers',
}

interface Props {
  activeCategoryLabel: string
  onOpenCategories: () => void
  subCategoryFilter: CatalogSubCategoryFilter
  onSubCategoryFilterChange: (value: CatalogSubCategoryFilter) => void
  availableSubCategories: CatalogMaterial[]
}

export const StorefrontShopFilters: FC<Props> = ({
  subCategoryFilter,
  onSubCategoryFilterChange,
  availableSubCategories,
}) => {
  const subCategories: CatalogSubCategoryFilter[] = ['all', ...availableSubCategories]

  return (
    <section aria-label="Shop filters" className="min-w-0">
      {availableSubCategories.length > 0 && (
        <div
          role="tablist"
          aria-label="Flower material"
          className="storefront-material-tabs grid w-full grid-cols-3 items-end"
        >
          {subCategories.map((subCategory) => {
            const active = subCategoryFilter === subCategory
            const label = subCategory === 'all' ? 'All Material' : SUBCATEGORY_LABELS[subCategory]

            return (
              <button
                key={subCategory}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => onSubCategoryFilterChange(subCategory)}
                className={`storefront-material-tab min-w-0 border-b-[3px] text-center sf-body focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/20 ${
                  active
                    ? 'storefront-material-tab--active border-black font-medium text-black'
                    : 'border-transparent font-normal text-black/80 hover:text-black'
                }`}
              >
                {label}
              </button>
            )
          })}
        </div>
      )}
    </section>
  )
}
