/**
 * @file catalogStoreTypes.ts
 * @description Shared type definitions for the product Catalog — the
 * customer-facing menu of sellable products (bouquets, boxes, vases,
 * standing flowers, wedding flowers), organized as master products with
 * one or more variants. Per Product Catalog System Specification v2.0:
 * Product ID (per master product) and SKU (per variant) are both
 * system-generated, read-only, and permanent.
 */

import type { StateCreator } from 'zustand'
import type { CsvParseError } from '../domain/catalogCsvDomain'
import type { UserRole } from './userStore'

/**
 * @description Categories are now user-managed data (see catalogStore's
 * `categories` state) rather than a fixed union, so shops can add/rename/
 * remove their own top-level product categories without a code change.
 * The type stays a plain string — validity is checked at runtime against
 * the current category list, not by the compiler.
 */
export type CatalogCategory = string

/**
 * @description A single user-managed top-level category. `prefix` is
 * used when new Product IDs/SKUs are generated. Owners may update it for
 * future products; identifiers already assigned to existing products remain unchanged.
 */
export interface CatalogCategoryConfig {
  id: string
  name: string
  prefix: string
}

export interface CatalogSizeGuideTemplate {
  id: string
  name: string
  imageUrl: string
  storagePath?: string
  byteSize: number
  width: 800
  height: 800
  createdAt: string
  updatedAt: string
}

export type CatalogSizeGuideTarget =
  | { id: string; templateId: string; scope: 'product_type'; productType: string }
  | { id: string; templateId: string; scope: 'product'; productId: string }

/**
 * @description Every category supports the same Fresh/Artificial material
 * split (spec's two-level hierarchy).
 */
export type CatalogMaterial = 'fresh' | 'artificial'

/**
 * @description Operational status of a variant (spec: Status is part of
 * the Variant Model, independent of the master product's isActive flag).
 */
export type CatalogVariantStatus = 'active' | 'inactive'

/**
 * @description A single size/variant of a master product. SKU is
 * auto-generated on save from Category + Material + Product + Size and
 * never changes afterward. On-hand quantity is not tracked in Catalog;
 * availability is controlled by product and variant status.
 */
export type CatalogImageMimeType = 'image/jpeg' | 'image/png' | 'image/webp'

/**
 * Canonical product-image metadata used by both OS and Storefront.
 * `url` may temporarily be a local data URL before Supabase Storage is connected;
 * `storagePath` is the future object key once the file is materialized in Storage.
 */
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

export interface CatalogVariant {
  /** Internal UUID primary key — stable even if the SKU format changes. */
  id: string
  /** Auto-generated, read-only, unique. E.g. "BOQ-FRE-RSB-05R-001". */
  sku: string
  /** Size label, e.g. "05R", "Small", "Medium". */
  size: string
  /** Sell price in IDR for this variant. */
  price: number
  /** Optional cost price in IDR — Finance-only field, used for margin reporting. */
  cost?: number
  status: CatalogVariantStatus
}

/**
 * @description A sellable master product in the Catalog. Product ID is
 * generated once when the product is created, is read-only, and is never
 * reused even after deletion.
 */
export interface CatalogProduct {
  /** Internal UUID primary key. Display identifier is `productId`, not this. */
  id: string
  /** Auto-generated, read-only, permanent. E.g. "BOQ-000001". */
  productId: string
  category: CatalogCategory
  /** All customer-facing occasions this product belongs to. */
  occasionTags?: CatalogCategory[]
  /** Original arrangement type from the product master (Bouquet, Vase, etc.). */
  productType?: string
  /** Optional named collection or series used by the customer-facing product name. */
  collectionSeries?: string
  /** Pricing behavior from the product master. */
  pricingType?: 'Fixed' | 'Starts From'
  /** Whether the product is a normal catalog item or custom order. */
  orderType?: 'Catalog' | 'Custom'
  material: CatalogMaterial
  name: string
  description?: string
  /** Canonical ordered image set. Phase 5 keeps legacy aliases below for migration compatibility. */
  images?: CatalogProductImage[]
  /** @deprecated Derived compatibility alias for the primary image URL. */
  thumbnail?: string
  /** @deprecated Derived compatibility alias for ordered image URLs. */
  gallery?: string[]
  /** One product may contain multiple variants; always at least one. */
  variants: CatalogVariant[]
  /** Whether to surface this product in the Featured section. */
  isFeatured?: boolean
  /** Whether the product is currently sellable. Retired products stay for history. */
  isActive: boolean
  /** Optional promo label, e.g. "-24%" or "Promo" (kept from prior storefront UI). */
  promoLabel?: string
  originalPriceIdr?: number
  /** Whether the product supports customization (e.g. wrapping, note). */
  isCustomizable?: boolean
}

/** Draft shape for creating a product: identifiers are assigned by the store. */
export type NewCatalogProductInput = Omit<CatalogProduct, 'id' | 'productId' | 'variants'> & {
  variants: NewCatalogVariantInput[]
}
export type NewCatalogVariantInput = Omit<CatalogVariant, 'id' | 'sku'> & {
  /** Only set when editing an existing variant; omitted for a brand-new one. */
  id?: string
  /** Only set when editing an existing variant; a new SKU is generated when absent. */
  sku?: string
}

export interface CsvImportSummary {
  createdProducts: number
  updatedProducts: number
  createdVariants: number
  updatedVariants: number
  errors: CsvParseError[]
}

/** Result of a category mutation, so the UI can show a specific reason on failure. */
export type CategoryMutationResult =
  | { ok: true }
  | { ok: false; reason: string }

/**
 * @description Internal state for the catalog store (raw data + CRUD only).
 * Action implementations live in the sibling catalogStoreXActions.ts files;
 * this interface is the shared contract they all implement pieces of.
 */
export interface CatalogStoreState {
  products: CatalogProduct[]
  sizeGuideTemplates: CatalogSizeGuideTemplate[]
  sizeGuideTargets: CatalogSizeGuideTarget[]
  /** Product IDs that once existed and were deleted — kept so their number is never reused. */
  deletedProductIds: string[]
  /** User-managed top-level categories, in display order. */
  categories: CatalogCategoryConfig[]
  /** User-managed arrangement types used by product forms and size-guide targeting. */
  arrangementTypes: string[]
  saveSizeGuideTemplate: (input: { id?: string; name: string; imageUrl: string; byteSize: number }) => string
  deleteSizeGuideTemplate: (templateId: string) => void
  assignSizeGuide: (input:
    | { templateId: string; scope: 'product_type'; productType: string }
    | { templateId: string; scope: 'product'; productId: string }
  ) => void
  removeSizeGuideTarget: (targetId: string) => void
  /** Adds a category. A prefix may be supplied or generated automatically. */
  addCategory: (name: string, prefix?: string) => CategoryMutationResult
  /** Updates category presentation. Existing Product IDs and SKUs are preserved. */
  updateCategory: (id: string, patch: { name: string; prefix: string }) => CategoryMutationResult
  /** Compatibility rename helper; preserves the current prefix. */
  renameCategory: (id: string, name: string) => CategoryMutationResult
  /** Deletes a category when it has no active products. Inactive products move to Uncategorized. */
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
  /** Bulk archive/unarchive (toggles isActive) for the bulk-manage toolbar. */
  setProductsActive: (productIds: string[], isActive: boolean) => void
  /** Bulk permanent delete for the bulk-manage toolbar. */
  deleteProducts: (productIds: string[]) => void
  /** Parses and applies a CSV import per the spec's match/create/update rules. */
  importCsv: (csvText: string) => CsvImportSummary
  /** Serializes the current catalog to CSV (Product ID + SKU included for reporting only). */
  exportCsv: () => string
}

export type CatalogStoreSet = Parameters<StateCreator<CatalogStoreState>>[0]
export type CatalogStoreGet = Parameters<StateCreator<CatalogStoreState>>[1]
