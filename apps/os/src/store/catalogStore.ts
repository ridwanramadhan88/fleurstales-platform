/**
 * @file catalogStore.ts
 * @description Raw state + wiring for the product Catalog.
 */

import { create } from 'zustand'
import type { CatalogStoreState } from './catalogStoreTypes'
import { SEED_CATEGORIES, SEED_PRODUCTS } from './catalogStoreSeedData'
import { createCatalogCategoryActions } from './catalogStoreCategoryActions'
import { createCatalogProductActions } from './catalogStoreProductActions'
import { createCatalogCsvActions } from './catalogStoreCsvActions'
import { createCatalogSizeGuideActions, loadPersistedSizeGuides } from './catalogStoreSizeGuideActions'
import { createCatalogArrangementTypeActions } from './catalogStoreArrangementTypeActions'

const persistedSizeGuides = loadPersistedSizeGuides()

export const useCatalogStore = create<CatalogStoreState>((set, get) => ({
  products: SEED_PRODUCTS,
  deletedProductIds: [],
  categories: SEED_CATEGORIES,
  arrangementTypes: [...new Set(SEED_PRODUCTS.map((product) => product.productType?.trim()).filter((value): value is string => Boolean(value)))].sort(),
  sizeGuideTemplates: persistedSizeGuides.templates,
  sizeGuideTargets: persistedSizeGuides.targets,

  ...createCatalogCategoryActions(set, get),
  ...createCatalogArrangementTypeActions(set, get),
  ...createCatalogProductActions(set),
  ...createCatalogCsvActions(set, get),
  ...createCatalogSizeGuideActions(set, get),
}))

export type {
  CatalogProduct,
  CatalogVariant,
  CatalogCategoryConfig,
  NewCatalogProductInput,
  NewCatalogVariantInput,
  CsvImportSummary,
  CategoryMutationResult,
  CatalogSizeGuideTemplate,
  CatalogSizeGuideTarget,
} from './catalogStoreTypes'
