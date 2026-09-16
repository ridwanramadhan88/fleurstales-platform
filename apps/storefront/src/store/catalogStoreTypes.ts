/**
 * @file catalogStoreTypes.ts
 * @description Shared type definitions for the product Catalog.
 */

import type { StateCreator } from 'zustand'
import type { CsvParseError } from '../domain/catalogCsvDomain'
import type { UserRole } from './userStore'

export type CatalogCategory = string

export interface CatalogCategoryConfig {
  id: string
  name: string
  prefix: string
}

/** Reusable child size owned by a size-template category. */
export interface CatalogSizeGuideSize {
  id: string
  name: string
  /** Child-level guide image. Parent image fields remain only as legacy fallback. */
  guideImageUrl?: string
  guideStoragePath?: string
  guideByteSize?: number
  guideWidth?: number
  guideHeight?: number
  sortOrder?: number
  isActive?: boolean
}

export interface CatalogSizeGuideTemplate {
  id: string
  /** Parent/category name, e.g. "Bouquet Standard". */
  name: string
  /** Reusable sellable sizes within the template/category. */
  sizes: CatalogSizeGuideSize[]
  /** @deprecated Legacy category-level guide image. New guides belong to child sizes. */
  imageUrl: string
  /** @deprecated Legacy category-level guide Storage path. */
  storagePath?: string
  /** @deprecated Legacy category-level guide byte size. */
  byteSize: number
  width: 800
  height: 800
  createdAt: string
  updatedAt: string
}

export type CatalogSizeGuideTarget =
  | { id: string; templateId: string; scope: 'product_type'; productType: string }
  | { id: string; templateId: string; scope: 'product'; productId: string }

export type CatalogMaterial = 'fresh' | 'artificial'
export type CatalogVariantStatus = 'active' | 'inactive'
export type CatalogImageMimeType = 'image/jpeg' | 'image/png' | 'image/webp'

export interface CatalogProductImage {
  id: string
  url: string
  storagePath?: string
  altText?: string
  sortOrder: number
  isPrimary: boolean
  mimeType?: CatalogImageMimeType
  byteSize?: number
  width?: number
  height?: number
}

export interface CatalogFlowerRecipeItem {
  id: string
  flowerName: string
  quantity: number
  unit: 'stem' | 'bunch'
}

export interface CatalogVariant {
  /** Internal UUID primary key — stable even if the SKU format changes. */
  id: string
  /** Auto-generated, read-only, unique. */
  sku: string
  /** Stable child-size identity. Optional while legacy variants are migrated. */
  sizeOptionId?: string
  /** Compatibility/customer-facing size label. */
  size: string
  /** Variant-owned product photos. Product-level photos remain the legacy fallback. */
  images?: CatalogProductImage[]
  /** Sell price in IDR for this variant. */
  price: number
  /** Optional cost price in IDR — Finance-only field. */
  cost?: number
  status: CatalogVariantStatus
  /** Customer-facing and production recipe scoped to this size. */
  flowerRecipe?: CatalogFlowerRecipeItem[]
}

export interface CatalogProduct {
  id: string
  productId: string
  category: CatalogCategory
  occasionTags?: CatalogCategory[]
  productType?: string
  collectionSeries?: string
  pricingType?: 'Fixed' | 'Starts From'
  orderType?: 'Catalog' | 'Custom'
  material: CatalogMaterial
  name: string
  description?: string
  /** Legacy/base product image set retained during the Batch 1 compatibility window. */
  images?: CatalogProductImage[]
  /** @deprecated Derived compatibility alias for the primary base image URL. */
  thumbnail?: string
  /** @deprecated Derived compatibility alias for ordered base image URLs. */
  gallery?: string[]
  variants: CatalogVariant[]
  isFeatured?: boolean
  isActive: boolean
  promoLabel?: string
  originalPriceIdr?: number
  isCustomizable?: boolean
}

export type NewCatalogProductInput = Omit<CatalogProduct, 'id' | 'productId' | 'variants'> & {
  variants: NewCatalogVariantInput[]
}
export type NewCatalogVariantInput = Omit<CatalogVariant, 'id' | 'sku'> & {
  id?: string
  sku?: string
}

export interface CsvImportSummary {
  createdProducts: number
  updatedProducts: number
  createdVariants: number
  updatedVariants: number
  errors: CsvParseError[]
}

export type CategoryMutationResult =
  | { ok: true }
  | { ok: false; reason: string }

export interface CatalogStoreState {
  products: CatalogProduct[]
  sizeGuideTemplates: CatalogSizeGuideTemplate[]
  sizeGuideTargets: CatalogSizeGuideTarget[]
  deletedProductIds: string[]
  categories: CatalogCategoryConfig[]
  arrangementTypes: string[]
  /** Parent template creation remains image-less; legacy image args are accepted for compatibility. */
  saveSizeGuideTemplate: (input: { id?: string; name: string; imageUrl?: string; byteSize?: number }) => string
  addSizeGuideTemplateSize: (templateId: string, name: string) => boolean
  updateSizeGuideTemplateSize: (
    templateId: string,
    sizeId: string,
    patch: Partial<Pick<CatalogSizeGuideSize, 'name' | 'guideImageUrl' | 'guideStoragePath' | 'guideByteSize' | 'guideWidth' | 'guideHeight' | 'sortOrder' | 'isActive'>>,
  ) => boolean
  archiveSizeGuideTemplateSize: (templateId: string, sizeId: string) => boolean
  deleteSizeGuideTemplate: (templateId: string) => void
  assignSizeGuide: (input:
    | { templateId: string; scope: 'product_type'; productType: string }
    | { templateId: string; scope: 'product'; productId: string }
  ) => void
  removeSizeGuideTarget: (targetId: string) => void
  addCategory: (name: string, prefix?: string) => CategoryMutationResult
  updateCategory: (id: string, patch: { name: string; prefix: string }) => CategoryMutationResult
  renameCategory: (id: string, name: string) => CategoryMutationResult
  deleteCategory: (id: string) => CategoryMutationResult
  addArrangementType: (name: string) => CategoryMutationResult
  renameArrangementType: (currentName: string, nextName: string) => CategoryMutationResult
  deleteArrangementType: (name: string) => CategoryMutationResult
  addProduct: (product: NewCatalogProductInput) => void
  updateProduct: (
    productId: string,
    patch: Partial<Omit<CatalogProduct, 'id' | 'productId' | 'variants'>> & {
      variants?: NewCatalogVariantInput[]
    },
  ) => void
  setProductActive: (productId: string, isActive: boolean) => void
  setCatalogVariantStatus: (params: { productId: string; variantId: string; status: CatalogVariantStatus; role: UserRole }) => boolean
  setProductsActive: (productIds: string[], isActive: boolean) => void
  deleteProducts: (productIds: string[]) => void
  importCsv: (csvText: string) => CsvImportSummary
  exportCsv: () => string
}

export type CatalogStoreSet = Parameters<StateCreator<CatalogStoreState>>[0]
export type CatalogStoreGet = Parameters<StateCreator<CatalogStoreState>>[1]