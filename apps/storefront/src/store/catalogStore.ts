/**
 * @file catalogStore.ts
 * @description Raw state + wiring for the product Catalog. Mirrors
 * ordersStore.ts: this file only holds state and composes actions from
 * focused sibling modules — category CRUD, product CRUD, and CSV
 * import/export each live in their own catalogStoreXActions.ts file, with
 * validation and construction logic pushed further down into the domain
 * layer (see domain/catalogCategoryDomain.ts, domain/catalogIdDomain.ts).
 *
 * Product ID and variant SKU are system-generated identifiers per the
 * Product Catalog System Specification v2.0: they are always produced here
 * (never accepted from callers), are read-only once set, and — for Product
 * ID — never reused even after a product is deleted (see `deletedProductIds`).
 */

import { create } from 'zustand'
import type { CatalogStoreState } from './catalogStoreTypes'
import { SEED_CATEGORIES, SEED_PRODUCTS } from './catalogStoreSeedData'
import { createCatalogCategoryActions } from './catalogStoreCategoryActions'
import { createCatalogProductActions } from './catalogStoreProductActions'
import { createCatalogCsvActions } from './catalogStoreCsvActions'
import { createCatalogSizeGuideActions, loadPersistedSizeGuides } from './catalogStoreSizeGuideActions'

const persistedSizeGuides = loadPersistedSizeGuides()

export const useCatalogStore = create<CatalogStoreState>((set, get) => ({
  products: SEED_PRODUCTS,
  deletedProductIds: [],
  categories: SEED_CATEGORIES,
  sizeGuideTemplates: persistedSizeGuides.templates,
  sizeGuideTargets: persistedSizeGuides.targets,

  ...createCatalogCategoryActions(set, get),
  ...createCatalogProductActions(set),
  ...createCatalogCsvActions(set, get),
  ...createCatalogSizeGuideActions(set),
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
