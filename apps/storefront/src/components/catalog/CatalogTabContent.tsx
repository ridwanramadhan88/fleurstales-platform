/**
 * @file CatalogTabContent.tsx
 * @description Catalog workspace with a clear page header, overview cards,
 * filters, product count, and product management actions.
 */

import type { FC } from 'react'
import { useRef } from 'react'
import {
  Download,
  FileText,
  ListChecks,
  ListPlus,
  MoreHorizontal,
  Sparkles,
  Tags,
  Upload,
} from 'lucide-react'
import { CatalogFiltersBar } from './CatalogFiltersBar'
import { CatalogProductRow } from './CatalogProductRow'
import { CatalogProductDetailSheet } from './CatalogProductDetailSheet'
import { CatalogItemFormSheet } from './CatalogItemFormSheet'
import { BulkActionBar } from '../product/BulkActionBar'
import { CatalogCategoriesDialogContainer } from './CatalogCategoriesDialogContainer'
import { CatalogPromoFeatureDialogContainer } from './CatalogPromoFeatureDialogContainer'
import { Button } from '../ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu'
import type { CatalogTabContentViewModel } from './CatalogTabContentController'

const currencyFormatter = new Intl.NumberFormat('id-ID')

export interface CatalogTabContentProps {
  searchQuery: string
  onSearchQueryChange: (value: string) => void
}

const OverviewCard: FC<{
  label: string
  value: number
  tone: 'neutral' | 'success' | 'warning' | 'info'
  selected?: boolean
  onClick?: () => void
}> = ({ label, value, tone, selected = false, onClick }) => {
  const accentClass = {
    neutral: 'text-foreground',
    success: 'text-success',
    warning: 'text-warning',
    info: 'text-info',
  }[tone]
  const selectedClass = selected
    ? tone === 'warning'
      ? 'bg-warning/5 ring-2 ring-warning/45'
      : tone === 'info'
        ? 'bg-info/5 ring-2 ring-info/45'
        : 'bg-accent ring-2 ring-primary/35'
    : 'bg-card ring-1 ring-border/70'
  const className = `min-w-0 rounded-xl p-3 text-left transition sm:p-4 ${selectedClass} ${
    onClick ? 'tap-scale hover:bg-muted/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25' : ''
  }`

  if (onClick) {
    return (
      <button type="button" onClick={onClick} aria-pressed={selected} className={className}>
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <p className={`mt-1 text-xl font-semibold ${accentClass}`}>{value}</p>
      </button>
    )
  }

  return (
    <div className={className}>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className={`mt-1 text-xl font-semibold ${accentClass}`}>{value}</p>
    </div>
  )
}

export const CatalogTabContent: FC<CatalogTabContentViewModel> = ({
  searchQuery,
  onSearchQueryChange,
  statusFilter,
  categoryFilter,
  subCategoryFilter,
  sortOption,
  sheetTarget,
  detailProductId,
  detailProduct,
  manageMode,
  selectedIds,
  categoriesDialogOpen,
  promoFeatureDialogOpen,
  quickFilter,
  overview,
  categoryNames,
  availableCategories,
  availableSubCategories,
  filteredProducts,
  allSelected,
  showingArchivedView,
  canEdit,
  onStatusFilterChange,
  onCategoryFilterChange,
  onSubCategoryFilterChange,
  onSortOptionChange,
  onQuickFilterToggle,
  onClearQuickFilter,
  onToggleManageMode,
  onToggleSelect,
  onToggleSelectAll,
  onEditProduct,
  onToggleProductFeatured,
  onToggleProductPromo,
  onToggleProductActive,
  onBulkArchive,
  onBulkUnarchive,
  onBulkDelete,
  onExportCsv,
  onDownloadTemplate,
  onImportFile,
  onOpenCreateSheet,
  onCloseSheet,
  onOpenDetail,
  onCloseDetail,
  onEditDetailProduct,
  onToggleDetailActive,
  onCreateProduct,
  onUpdateProduct,
  onOpenCategoriesDialog,
  onCloseCategoriesDialog,
  onOpenPromoFeatureDialog,
  onClosePromoFeatureDialog,
  onClearFilters,
}) => {
  const csvInputRef = useRef<HTMLInputElement | null>(null)

  return (
    <section className="space-y-4 pb-6">
      <section
        aria-label="Catalog overview"
        className="space-y-3"
      >
        <header className="space-y-3 sm:flex sm:items-start sm:justify-between sm:gap-4 sm:space-y-0">
          <div className="min-w-0 flex-1">
            <h1 className="font-display text-2xl font-semibold leading-tight text-foreground">Catalog</h1>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              Manage products, availability, featured items, and promotions.
            </p>
          </div>

          {canEdit && (
            <div className="flex items-center gap-2">
              <input
                ref={csvInputRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={onImportFile}
              />
              <Button type="button" onClick={onOpenCreateSheet} className="flex-1 sm:flex-none">
                <ListPlus className="size-4" />
                Add product
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button type="button" variant="outline" size="icon" aria-label="More catalog actions">
                    <MoreHorizontal className="size-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => csvInputRef.current?.click()}>
                    <Upload className="mr-2 size-4" /> Import CSV
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={onExportCsv}>
                    <Download className="mr-2 size-4" /> Export CSV
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={onDownloadTemplate}>
                    <FileText className="mr-2 size-4" /> Download CSV template
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={onOpenCategoriesDialog}>
                    <Tags className="mr-2 size-4" /> Manage occasions
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={onOpenPromoFeatureDialog}>
                    <Sparkles className="mr-2 size-4" /> Promo & featured products
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={onToggleManageMode}>
                    <ListChecks className="mr-2 size-4" /> {manageMode ? 'Finish managing' : 'Manage products'}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}
        </header>

        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 sm:gap-3">
          <OverviewCard label="Total products" value={overview.totalProducts} tone="neutral" />
          <OverviewCard label="Active products" value={overview.activeCount} tone="success" />
          <OverviewCard
            label="Featured products"
            value={overview.featuredCount}
            tone="info"
            selected={quickFilter === 'featured'}
            onClick={() => onQuickFilterToggle('featured')}
          />
          <OverviewCard
            label="Products on promo"
            value={overview.promoCount}
            tone="warning"
            selected={quickFilter === 'promo'}
            onClick={() => onQuickFilterToggle('promo')}
          />
        </div>
      </section>

      <CatalogFiltersBar
        statusFilter={statusFilter}
        onStatusFilterChange={onStatusFilterChange}
        categoryFilter={categoryFilter}
        onCategoryFilterChange={onCategoryFilterChange}
        availableCategories={availableCategories}
        subCategoryFilter={subCategoryFilter}
        onSubCategoryFilterChange={onSubCategoryFilterChange}
        availableSubCategories={availableSubCategories}
        sortOption={sortOption}
        onSortOptionChange={onSortOptionChange}
        searchQuery={searchQuery}
        onSearchQueryChange={onSearchQueryChange}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <p className="text-xs font-medium text-muted-foreground">
            {filteredProducts.length} product{filteredProducts.length === 1 ? '' : 's'}
          </p>
          {quickFilter && (
            <button
              type="button"
              onClick={onClearQuickFilter}
              className="rounded-full bg-accent px-3 py-1.5 text-xs font-medium text-foreground transition hover:bg-muted"
            >
              {quickFilter === 'featured' ? 'Featured' : 'On promo'} · Clear
            </button>
          )}
        </div>

        {canEdit && manageMode && (
          <Button type="button" variant="secondary" onClick={onToggleManageMode}>
            <ListChecks className="size-4" /> Done
          </Button>
        )}
      </div>

      {manageMode && (
        <BulkActionBar
          selectedCount={selectedIds.size}
          totalCount={filteredProducts.length}
          allSelected={allSelected}
          onToggleSelectAll={onToggleSelectAll}
          onArchive={!showingArchivedView ? onBulkArchive : undefined}
          onUnarchive={showingArchivedView ? onBulkUnarchive : undefined}
          onDelete={onBulkDelete}
          onDone={onToggleManageMode}
        />
      )}

      <section aria-label="Catalog products" className="space-y-3">
        {filteredProducts.length === 0 ? (
          <div className="flex min-h-48 flex-col items-center justify-center gap-3 rounded-xl bg-card px-6 py-8 text-center ring-1 ring-border">
            <p className="text-sm font-semibold leading-5 text-foreground">No products found</p>
            <p className="text-xs text-muted-foreground">
              No products match these filters. Try a different search or occasion.
            </p>
            <Button type="button" variant="secondary" onClick={onClearFilters}>Clear filters</Button>
          </div>
        ) : (
          filteredProducts.map((product) => (
            <CatalogProductRow
              key={product.id}
              product={product}
              formatter={currencyFormatter}
              manageMode={manageMode}
              selected={selectedIds.has(product.id)}
              onToggleSelect={() => onToggleSelect(product.id)}
              onOpenDetail={() => onOpenDetail(product.id)}
              canEdit={canEdit}
              onEdit={() => onEditProduct(product.id)}
              onToggleFeatured={() => onToggleProductFeatured(product.id)}
              onTogglePromo={() => onToggleProductPromo(product.id)}
              onToggleActive={() => onToggleProductActive(product.id)}
            />
          ))
        )}
      </section>

      <CatalogProductDetailSheet
        open={detailProductId !== null}
        product={detailProduct}
        formatter={currencyFormatter}
        onClose={onCloseDetail}
        onEditRequest={onEditDetailProduct}
        onToggleActive={onToggleDetailActive}
        canEdit={canEdit}
      />
      <CatalogItemFormSheet
        open={sheetTarget !== null}
        onClose={onCloseSheet}
        product={sheetTarget !== 'new' ? sheetTarget : null}
        categoryOptions={categoryNames}
        onCreate={onCreateProduct}
        onUpdate={onUpdateProduct}
      />
      <CatalogCategoriesDialogContainer open={categoriesDialogOpen} onClose={onCloseCategoriesDialog} />
      <CatalogPromoFeatureDialogContainer open={promoFeatureDialogOpen} onClose={onClosePromoFeatureDialog} />
    </section>
  )
}

export default CatalogTabContent
