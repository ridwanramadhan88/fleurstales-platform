/** Catalog category navigation and secondary filters. */
import type { FC } from 'react'
import { ArrowDownUp, Layers, MoreHorizontal } from 'lucide-react'
import type { CatalogCategory, CatalogMaterial } from '../../store/catalogStoreTypes'
import {
  CATALOG_SORT_LABELS,
  type CatalogCategoryFilter,
  type CatalogSortOption,
  type CatalogStatusFilter,
  type CatalogSubCategoryFilter,
} from '../../domain/catalogDomain'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu'

const SUBCATEGORY_LABELS: Record<CatalogMaterial, string> = {
  fresh: 'Fresh',
  artificial: 'Artificial',
}

const SORT_OPTIONS: CatalogSortOption[] = [
  'name_asc',
  'name_desc',
  'price_asc',
  'price_desc',
  'featured_first',
]

const STATUS_MENU_OPTIONS: { id: CatalogStatusFilter; label: string }[] = [
  { id: 'active', label: 'Active products' },
  { id: 'archived', label: 'Archived products' },
  { id: 'all', label: 'All products' },
]

export interface CatalogFiltersBarProps {
  label?: string
  statusFilter?: CatalogStatusFilter
  onStatusFilterChange?: (value: CatalogStatusFilter) => void
  categoryFilter: CatalogCategoryFilter
  onCategoryFilterChange: (value: CatalogCategoryFilter) => void
  availableCategories: CatalogCategory[]
  subCategoryFilter: CatalogSubCategoryFilter
  onSubCategoryFilterChange: (value: CatalogSubCategoryFilter) => void
  availableSubCategories: CatalogMaterial[]
  sortOption?: CatalogSortOption
  onSortOptionChange?: (value: CatalogSortOption) => void
  searchQuery?: string
  onSearchQueryChange?: (value: string) => void
}

export const CatalogFiltersBar: FC<CatalogFiltersBarProps> = ({
  label = 'Categories',
  statusFilter,
  onStatusFilterChange,
  categoryFilter,
  onCategoryFilterChange,
  availableCategories,
  subCategoryFilter,
  onSubCategoryFilterChange,
  availableSubCategories,
  sortOption,
  onSortOptionChange,
}) => {
  const isNonDefaultStatus = statusFilter !== undefined && statusFilter !== 'active'
  const categories: CatalogCategoryFilter[] = ['all', ...availableCategories]

  return (
    <section aria-label="Catalog filters" className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="mb-1 text-sm font-semibold text-muted-foreground">{label}</p>
          <div className="no-scrollbar flex min-w-0 gap-1 overflow-x-auto border-b border-border px-0.5">
            {categories.map((category) => {
              const active = categoryFilter === category
              return (
                <button
                  key={category}
                  type="button"
                  onClick={() => onCategoryFilterChange(category)}
                  className={`h-11 shrink-0 border-b-2 px-3 text-sm font-medium transition ${
                    active
                      ? 'border-foreground text-foreground'
                      : 'border-transparent text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {category === 'all' ? 'All' : category}
                </button>
              )
            })}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2 pb-1">
          {availableSubCategories.length > 0 && (
            <Select
              value={subCategoryFilter}
              onValueChange={(value) =>
                onSubCategoryFilterChange(value as CatalogSubCategoryFilter)
              }
            >
              <SelectTrigger className="h-11 min-w-[9rem] gap-1.5 rounded-full border border-border bg-background px-3.5 text-sm shadow-none">
                <Layers className="size-4 shrink-0 text-muted-foreground" />
                <SelectValue placeholder="All types" />
              </SelectTrigger>
              <SelectContent align="end">
                <SelectItem value="all">All types</SelectItem>
                {availableSubCategories.map((subCategory) => (
                  <SelectItem key={subCategory} value={subCategory}>
                    {SUBCATEGORY_LABELS[subCategory]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {sortOption && onSortOptionChange && (
            <Select
              value={sortOption}
              onValueChange={(value) => onSortOptionChange(value as CatalogSortOption)}
            >
              <SelectTrigger
                className="h-11 w-11 shrink-0 rounded-full border border-border bg-background p-0 shadow-none [&>svg:last-child]:hidden"
                aria-label={`Sort products: ${CATALOG_SORT_LABELS[sortOption]}`}
                title={`Sort: ${CATALOG_SORT_LABELS[sortOption]}`}
              >
                <ArrowDownUp className="mx-auto size-4 text-muted-foreground" />
              </SelectTrigger>
              <SelectContent align="end">
                {SORT_OPTIONS.map((option) => (
                  <SelectItem key={option} value={option}>
                    {CATALOG_SORT_LABELS[option]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {statusFilter && onStatusFilterChange && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label="More product views"
                  className={`relative flex size-11 shrink-0 items-center justify-center rounded-full border transition ${
                    isNonDefaultStatus
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground'
                  }`}
                >
                  <MoreHorizontal className="size-4" />
                  {isNonDefaultStatus && (
                    <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-primary-foreground" />
                  )}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {STATUS_MENU_OPTIONS.map((option) => (
                  <DropdownMenuItem
                    key={option.id}
                    onClick={() => onStatusFilterChange(option.id)}
                    className={statusFilter === option.id ? 'font-semibold text-foreground' : ''}
                  >
                    {option.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>
    </section>
  )
}

export default CatalogFiltersBar
