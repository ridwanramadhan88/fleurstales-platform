import { useMemo, useState } from 'react'
import type { ChangeEvent } from 'react'
import {
  useCatalogStore,
  type NewCatalogProductInput,
  type NewCatalogVariantInput,
} from '../../store/catalogStore'
import type { CatalogMaterial, CatalogProduct } from '../../store/catalogStoreTypes'
import { useUserStore } from '../../store/userStore'
import { useOrdersStore } from '../../store/ordersStore'
import { canEditSection } from '../../config/permissions'
import { useSettingsStore } from '../../store/settingsStore'
import {
  filterCatalogProducts,
  getAvailableCategories,
  getAvailableSubCategories,
  getCatalogOverviewStats,
  sortCatalogProducts,
  type CatalogCategoryFilter,
  type CatalogSortOption,
  type CatalogStatusFilter,
  type CatalogSubCategoryFilter,
} from '../../domain/catalogDomain'
import { buildCatalogCsvTemplate } from '../../domain/catalogCsvDomain'
import { toast } from '../../hooks/use-toast'
import type { CatalogTabContentProps } from './CatalogTabContent'
import { requestAppConfirmation } from '../ui/app-confirm'

export interface CatalogTabContentViewModel {
  searchQuery: string
  onSearchQueryChange: (value: string) => void
  statusFilter: CatalogStatusFilter
  categoryFilter: CatalogCategoryFilter
  subCategoryFilter: CatalogSubCategoryFilter
  sortOption: CatalogSortOption
  sheetTarget: CatalogProduct | 'new' | null
  detailProductId: string | null
  detailProduct: CatalogProduct | null
  manageMode: boolean
  selectedIds: Set<string>
  categoriesDialogOpen: boolean
  promoFeatureDialogOpen: boolean
  quickFilter: 'featured' | 'promo' | null
  overview: ReturnType<typeof getCatalogOverviewStats>
  categoryNames: string[]
  availableCategories: string[]
  availableSubCategories: CatalogMaterial[]
  filteredProducts: CatalogProduct[]
  allSelected: boolean
  showingArchivedView: boolean
  canEdit: boolean
  onStatusFilterChange: (value: CatalogStatusFilter) => void
  onCategoryFilterChange: (value: CatalogCategoryFilter) => void
  onSubCategoryFilterChange: (value: CatalogSubCategoryFilter) => void
  onSortOptionChange: (value: CatalogSortOption) => void
  onQuickFilterToggle: (filter: 'featured' | 'promo') => void
  onClearQuickFilter: () => void
  onToggleManageMode: () => void
  onToggleSelect: (id: string) => void
  onToggleSelectAll: () => void
  onEditProduct: (productId: string) => void
  onToggleProductFeatured: (productId: string) => void
  onToggleProductPromo: (productId: string) => void
  onToggleProductActive: (productId: string) => void
  onBulkArchive: () => void
  onBulkUnarchive: () => void
  onBulkDelete: () => void
  onExportCsv: () => void
  onDownloadTemplate: () => void
  onImportFile: (event: ChangeEvent<HTMLInputElement>) => void
  onOpenCreateSheet: () => void
  onCloseSheet: () => void
  onOpenDetail: (productId: string) => void
  onCloseDetail: () => void
  onEditDetailProduct: () => void
  onToggleDetailActive: (isActive: boolean) => void
  onCreateProduct: (params: NewCatalogProductInput) => void
  onUpdateProduct: (params: {
    productId: string
  } & Partial<Omit<CatalogProduct, 'id' | 'productId' | 'variants'>> & {
      variants?: NewCatalogVariantInput[]
    }) => void
  onOpenCategoriesDialog: () => void
  onCloseCategoriesDialog: () => void
  onOpenPromoFeatureDialog: () => void
  onClosePromoFeatureDialog: () => void
  onClearFilters: () => void
}

const downloadCsv = (filename: string, csv: string) => {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

export const useCatalogTabContentController = ({
  searchQuery,
  onSearchQueryChange,
}: CatalogTabContentProps): CatalogTabContentViewModel => {
  const products = useCatalogStore((state) => state.products)
  const addProduct = useCatalogStore((state) => state.addProduct)
  const updateProduct = useCatalogStore((state) => state.updateProduct)
  const setCatalogVariantStatus = useCatalogStore((state) => state.setCatalogVariantStatus)
  const setProductActive = useCatalogStore((state) => state.setProductActive)
  const setProductsActive = useCatalogStore((state) => state.setProductsActive)
  const deleteProducts = useCatalogStore((state) => state.deleteProducts)
  const importCsv = useCatalogStore((state) => state.importCsv)
  const exportCsv = useCatalogStore((state) => state.exportCsv)
  const categories = useCatalogStore((state) => state.categories)
  const orders = useOrdersStore((state) => state.orders)
  const userRole = useUserStore((state) => state.role)
  const permissions = useSettingsStore((state) => state.permissions)
  const canEdit = canEditSection(userRole, 'catalog', permissions)

  const [statusFilter, setStatusFilter] = useState<CatalogStatusFilter>('active')
  const [categoryFilter, setCategoryFilter] = useState<CatalogCategoryFilter>('all')
  const [subCategoryFilter, setSubCategoryFilter] =
    useState<CatalogSubCategoryFilter>('all')
  const [sortOption, setSortOption] = useState<CatalogSortOption>('name_asc')
  const [sheetTarget, setSheetTarget] = useState<CatalogProduct | 'new' | null>(
    null,
  )
  const [detailProductId, setDetailProductId] = useState<string | null>(null)
  const [manageMode, setManageMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [categoriesDialogOpen, setCategoriesDialogOpen] = useState(false)
  const [promoFeatureDialogOpen, setPromoFeatureDialogOpen] = useState(false)
  const [quickFilter, setQuickFilter] = useState<'featured' | 'promo' | null>(null)

  const overview = useMemo(() => getCatalogOverviewStats(products), [products])
  const categoryNames = useMemo(() => categories.map((category) => category.name), [categories])
  const availableCategories = useMemo(
    () => getAvailableCategories(products, categoryNames),
    [products, categoryNames],
  )
  const availableSubCategories = useMemo(
    () => getAvailableSubCategories(products, categoryFilter),
    [products, categoryFilter],
  )
  const filteredProducts = useMemo(() => {
    const filtered = filterCatalogProducts(products, {
      category: categoryFilter,
      subCategory: subCategoryFilter,
      query: searchQuery,
      status: statusFilter,
    })
    const quickFiltered =
      quickFilter === 'featured'
        ? filtered.filter((product) => product.isFeatured)
        : quickFilter === 'promo'
          ? filtered.filter((product) => Boolean(product.promoLabel))
          : filtered
    return sortCatalogProducts(quickFiltered, sortOption)
  }, [
    products,
    categoryFilter,
    subCategoryFilter,
    searchQuery,
    statusFilter,
    sortOption,
    quickFilter,
  ])

  const detailProduct = detailProductId
    ? (products.find((product) => product.id === detailProductId) ?? null)
    : null
  const allSelected =
    filteredProducts.length > 0 && selectedIds.size === filteredProducts.length
  const showingArchivedView = statusFilter === 'archived'

  return {
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
    onStatusFilterChange: setStatusFilter,
    onCategoryFilterChange: (value) => {
      setCategoryFilter(value)
      setSubCategoryFilter('all')
    },
    onSubCategoryFilterChange: setSubCategoryFilter,
    onSortOptionChange: setSortOption,
    onQuickFilterToggle: (filter) => {
      setQuickFilter((previous) => (previous === filter ? null : filter))
      setStatusFilter('active')
    },
    onClearQuickFilter: () => setQuickFilter(null),
    onToggleManageMode: () => {
      setManageMode((previous) => !previous)
      setSelectedIds(new Set())
    },
    onToggleSelect: (id) => {
      setSelectedIds((previous) => {
        const next = new Set(previous)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        return next
      })
    },
    onToggleSelectAll: () => {
      setSelectedIds(
        allSelected
          ? new Set()
          : new Set(filteredProducts.map((product) => product.id)),
      )
    },
    onEditProduct: (productId) => {
      const target = products.find((product) => product.id === productId)
      if (target) setSheetTarget(target)
    },
    onToggleProductFeatured: (productId) => {
      const target = products.find((product) => product.id === productId)
      if (target) updateProduct(productId, { isFeatured: !target.isFeatured })
    },
    onToggleProductPromo: (productId) => {
      const target = products.find((product) => product.id === productId)
      if (target) updateProduct(productId, { promoLabel: target.promoLabel ? undefined : '-10%' })
    },
    onToggleProductActive: (productId) => {
      const target = products.find((product) => product.id === productId)
      if (target) setProductActive(productId, !target.isActive)
    },
    onBulkArchive: () => {
      setProductsActive(Array.from(selectedIds), false)
      setSelectedIds(new Set())
    },
    onBulkUnarchive: () => {
      setProductsActive(Array.from(selectedIds), true)
      setSelectedIds(new Set())
    },
    onBulkDelete: async () => {
      const selected = products.filter((product) => selectedIds.has(product.id))
      if (selected.length === 0) return
      const referencedIds = new Set(
        selected
          .filter((product) =>
            orders.some((order) =>
              order.productId === product.id ||
              order.items?.some((item) => item.productId === product.id),
            ),
          )
          .map((product) => product.id),
      )
      const deletableIds = selected.map((product) => product.id).filter((id) => !referencedIds.has(id))
      const archiveCount = referencedIds.size
      const deleteCount = deletableIds.length
      const description = archiveCount > 0
        ? `${deleteCount} unreferenced product${deleteCount === 1 ? '' : 's'} will be deleted. ${archiveCount} product${archiveCount === 1 ? '' : 's'} used by orders will be archived instead.`
        : `Delete ${deleteCount} product${deleteCount === 1 ? '' : 's'}? This cannot be undone.`
      const confirmed = await requestAppConfirmation({
        title: archiveCount > 0 ? 'Clean up selected products?' : 'Delete products?',
        description,
        confirmLabel: archiveCount > 0 ? 'Continue' : 'Delete',
        destructive: deleteCount > 0,
      })
      if (!confirmed) return
      if (archiveCount > 0) setProductsActive(Array.from(referencedIds), false)
      if (deleteCount > 0) deleteProducts(deletableIds)
      setSelectedIds(new Set())
      toast({ description: archiveCount > 0 ? 'Referenced products were archived; unused products were deleted.' : 'Products deleted.' })
    },
    onExportCsv: () => {
      downloadCsv('fleurstales-catalog.csv', exportCsv())
    },
    onDownloadTemplate: () => {
      downloadCsv('fleurstales-catalog-template.csv', buildCatalogCsvTemplate(categoryNames))
    },
    onImportFile: (event) => {
      const file = event.target.files?.[0]
      event.target.value = ''
      if (!file) return
      file.text().then((text) => {
        const summary = importCsv(text)
        if (summary.errors.length > 0) {
          toast({
            description: `Imported with ${summary.errors.length} row error(s): ${summary.errors
              .slice(0, 2)
              .map((error) => `Row ${error.row}: ${error.message}`)
              .join('; ')}`,
          })
        } else {
          toast({
            description: `Imported: ${summary.createdProducts} new product(s), ${summary.updatedProducts} updated, ${summary.createdVariants} new variant(s), ${summary.updatedVariants} variant(s) updated.`,
          })
        }
      })
    },
    onOpenCreateSheet: () => setSheetTarget('new'),
    onCloseSheet: () => setSheetTarget(null),
    onOpenDetail: setDetailProductId,
    onCloseDetail: () => setDetailProductId(null),
    onEditDetailProduct: () => {
      if (detailProduct) setSheetTarget(detailProduct)
      setDetailProductId(null)
    },
    onToggleDetailActive: (isActive) => {
      if (detailProduct) setProductActive(detailProduct.id, isActive)
    },
    onCreateProduct: addProduct,
    onUpdateProduct: ({ productId, ...patch }) => {
      const current = products.find((product) => product.id === productId)
      updateProduct(productId, patch)
      for (const variant of patch.variants ?? []) {
        if (!variant.id) continue
        const previous = current?.variants.find((item) => item.id === variant.id)
        if (previous && previous.status !== variant.status) setCatalogVariantStatus({ productId, variantId: variant.id, status: variant.status, role: userRole })
      }
    },
    onOpenCategoriesDialog: () => setCategoriesDialogOpen(true),
    onCloseCategoriesDialog: () => setCategoriesDialogOpen(false),
    onOpenPromoFeatureDialog: () => setPromoFeatureDialogOpen(true),
    onClosePromoFeatureDialog: () => setPromoFeatureDialogOpen(false),
    onClearFilters: () => {
      onSearchQueryChange('')
      setCategoryFilter('all')
      setSubCategoryFilter('all')
      setStatusFilter('active')
    },
  }
}
