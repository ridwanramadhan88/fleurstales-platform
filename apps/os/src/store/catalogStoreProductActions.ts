/**
 * @file catalogStoreProductActions.ts
 * @description Product mutation actions (add/update/activate/delete) for
 * the Catalog store. Also owns `buildProduct` and its supporting helpers —
 * assembling a full CatalogProduct (generated Product ID + variant SKUs) —
 * since that construction logic is shared with CSV import
 * (see catalogStoreCsvActions.ts).
 */

import type {
  CatalogProduct,
  CatalogStoreSet,
  CatalogStoreState,
  CatalogVariant,
  NewCatalogProductInput,
} from './catalogStoreTypes'
import {
  generateCategoryPrefix,
  generateProductId,
  generateSku,
} from '../domain/catalogIdDomain'
import { generateId } from '../lib/id'
import { canSetCatalogVariantStatus } from '../domain/catalogVariantStatusDomain'
import { isSectionEditAuthorized } from '../config/authorization'
import { assignCatalogImageStoragePaths, getCatalogProductImageAliases, normalizeCatalogProductImages } from '../domain/catalogImageDomain'

/**
 * @description All SKUs currently in use, used to avoid collisions when
 * generating a new one.
 */
export const allSkus = (products: CatalogProduct[]): string[] =>
  products.flatMap((product) => product.variants.map((variant) => variant.sku))

/**
 * @description All Product IDs ever assigned (including deleted ones), so a
 * newly generated Product ID never reuses a retired one.
 */
export const allProductIds = (
  products: CatalogProduct[],
  deletedProductIds: string[],
): string[] => [...products.map((product) => product.productId), ...deletedProductIds]

/**
 * @description Assembles a fully-formed CatalogProduct from a draft input:
 * generates the Product ID and each variant's SKU (per catalogIdDomain's
 * rules) and assigns internal ids. Shared by addProduct and CSV import.
 */
export const buildProduct = (
  input: NewCatalogProductInput,
  categoryPrefix: string,
  existingProductIds: string[],
  existingSkus: string[],
): CatalogProduct => {
  const productId = generateProductId(categoryPrefix, existingProductIds)
  const skusInUse = [...existingSkus]

  const variants: CatalogVariant[] = input.variants.map((variant) => {
    const sku = generateSku(
      categoryPrefix,
      input.material,
      input.name,
      variant.size,
      skusInUse,
    )
    skusInUse.push(sku)
    return { ...variant, id: generateId('var'), sku }
  })

  const draft = { ...input, id: generateId('prod'), productId, variants }
  const images = assignCatalogImageStoragePaths(draft.id, normalizeCatalogProductImages(draft))
  return { ...draft, images, ...getCatalogProductImageAliases(images) }
}

type ProductActions = Pick<
  CatalogStoreState,
  | 'addProduct'
  | 'updateProduct'
  | 'setProductActive'
  | 'setCatalogVariantStatus'
  | 'setProductsActive'
  | 'deleteProducts'
>

export const createCatalogProductActions = (set: CatalogStoreSet): ProductActions => ({
  addProduct: (product) => {
    if (!isSectionEditAuthorized('catalog')) return
    set((state) => {
      const categoryConfig = state.categories.find((c) => c.name === product.category)
      const prefix = categoryConfig?.prefix ?? generateCategoryPrefix(product.category, [])
      return {
        products: [
          ...state.products,
          buildProduct(
            product,
            prefix,
            allProductIds(state.products, state.deletedProductIds),
            allSkus(state.products),
          ),
        ],
      }
    })
  },

  updateProduct: (productId, patch) => {
    if (!isSectionEditAuthorized('catalog')) return
    set((state) => {
      // Product ID and internal id are assigned once and never accepted from a patch.
      const safePatch = { ...patch }

      return {
        products: state.products.map((product) => {
          if (product.id !== productId) return product
          const { variants: variantPatch, ...rest } = safePatch
          const merged: CatalogProduct = { ...product, ...rest }

          // If variants were replaced/added without a SKU (e.g. a new size
          // added in the edit form), generate one; existing SKUs on
          // unchanged variants are preserved as-is (read-only after creation).
          if (variantPatch) {
            const skusInUse = allSkus(state.products).filter(
              (sku) => !product.variants.some((v) => v.sku === sku),
            )
            const categoryPrefix =
              state.categories.find((c) => c.name === merged.category)?.prefix ??
              generateCategoryPrefix(merged.category, [])
            merged.variants = variantPatch.map((variant) => {
              if (variant.sku) {
                skusInUse.push(variant.sku)
                const existing = product.variants.find((item) => item.id === variant.id)
                return { ...variant, status: existing?.status ?? variant.status, id: variant.id ?? generateId('var'), sku: variant.sku }
              }
              const sku = generateSku(
                categoryPrefix,
                merged.material,
                merged.name,
                variant.size,
                skusInUse,
              )
              skusInUse.push(sku)
              return { ...variant, id: variant.id ?? generateId('var'), sku }
            })
          }

          const images = assignCatalogImageStoragePaths(merged.id, normalizeCatalogProductImages(merged))
          return { ...merged, images, ...getCatalogProductImageAliases(images) }
        }),
      }
    })
  },

  setCatalogVariantStatus: ({ productId, variantId, status, role }) => {
    if (!isSectionEditAuthorized('catalog')) return false
    let changed = false
    set((state) => {
      if (!canSetCatalogVariantStatus({ products: state.products, productId, variantId, status, role }).ok) return state
      changed = true
      return { products: state.products.map((product) => product.id === productId ? { ...product, variants: product.variants.map((variant) => variant.id === variantId ? { ...variant, status } : variant) } : product) }
    })
    return changed
  },

  setProductActive: (productId, isActive) => {
    if (!isSectionEditAuthorized('catalog')) return
    set((state) => ({
      products: state.products.map((product) =>
        product.id === productId ? { ...product, isActive } : product,
      ),
    }))
  },

  setProductsActive: (productIds, isActive) => {
    if (!isSectionEditAuthorized('catalog')) return
    const idSet = new Set(productIds)
    set((state) => ({
      products: state.products.map((product) =>
        idSet.has(product.id) ? { ...product, isActive } : product,
      ),
    }))
  },

  deleteProducts: (productIds) => {
    if (!isSectionEditAuthorized('catalog')) return
    const idSet = new Set(productIds)
    set((state) => {
      const removed = state.products.filter((product) => idSet.has(product.id))
      return {
        products: state.products.filter((product) => !idSet.has(product.id)),
        // Product ID sequence numbers are never reused, even after deletion.
        deletedProductIds: [
          ...state.deletedProductIds,
          ...removed.map((product) => product.productId),
        ],
      }
    })
  },
})
