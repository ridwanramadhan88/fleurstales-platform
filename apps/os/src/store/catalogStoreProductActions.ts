/**
 * @file catalogStoreProductActions.ts
 * @description Product mutation actions for the Catalog store.
 */

import type { CatalogProduct, CatalogStoreSet, CatalogStoreState, CatalogVariant, NewCatalogProductInput } from './catalogStoreTypes'
import { generateCategoryPrefix, generateProductId, generateSku } from '../domain/catalogIdDomain'
import { generateId } from '../lib/id'
import { canSetCatalogVariantStatus } from '../domain/catalogVariantStatusDomain'
import { isSectionEditAuthorized } from '../config/authorization'
import { assignCatalogImageStoragePaths, getCatalogProductImageAliases, normalizeCatalogProductImages } from '../domain/catalogImageDomain'

export const allSkus = (products: CatalogProduct[]): string[] => products.flatMap((product) => product.variants.map((variant) => variant.sku))
export const allProductIds = (products: CatalogProduct[], deletedProductIds: string[]): string[] => [...products.map((product) => product.productId), ...deletedProductIds]

const materializeVariantImages = (productId: string, variant: CatalogVariant): CatalogVariant => ({
  ...variant,
  images: assignCatalogImageStoragePaths(`${productId}/${variant.id}`, variant.images ?? [])
    .map((image, index) => ({ ...image, sortOrder: index, isPrimary: index === 0 })),
})

export const buildProduct = (
  input: NewCatalogProductInput,
  categoryPrefix: string,
  existingProductIds: string[],
  existingSkus: string[],
): CatalogProduct => {
  const productId = generateProductId(categoryPrefix, existingProductIds)
  const internalProductId = generateId('prod')
  const skusInUse = [...existingSkus]
  const variants: CatalogVariant[] = input.variants.map((variant) => {
    const sku = generateSku(categoryPrefix, input.material, input.name, variant.size, skusInUse)
    skusInUse.push(sku)
    return materializeVariantImages(internalProductId, { ...variant, id: generateId('var'), sku })
  })
  const draft = {
    ...input,
    isActive: input.isActive && variants.some((variant) => variant.status === 'active'),
    id: internalProductId,
    productId,
    variants,
  }
  const images = assignCatalogImageStoragePaths(draft.id, normalizeCatalogProductImages(draft))
  return { ...draft, images, ...getCatalogProductImageAliases(images) }
}

type ProductActions = Pick<CatalogStoreState, 'addProduct' | 'updateProduct' | 'setProductActive' | 'setCatalogVariantStatus' | 'setProductsActive' | 'deleteProducts'>

export const createCatalogProductActions = (set: CatalogStoreSet): ProductActions => ({
  addProduct: (product) => {
    if (!isSectionEditAuthorized('catalog')) return
    set((state) => {
      const categoryConfig = state.categories.find((c) => c.name === product.category)
      const prefix = categoryConfig?.prefix ?? generateCategoryPrefix(product.category, [])
      return { products: [...state.products, buildProduct(product, prefix, allProductIds(state.products, state.deletedProductIds), allSkus(state.products))] }
    })
  },

  updateProduct: (productId, patch) => {
    if (!isSectionEditAuthorized('catalog')) return
    set((state) => ({
      products: state.products.map((product) => {
        if (product.id !== productId) return product
        const { variants: variantPatch, ...rest } = { ...patch }
        const merged: CatalogProduct = { ...product, ...rest }
        if (variantPatch) {
          const skusInUse = allSkus(state.products).filter((sku) => !product.variants.some((v) => v.sku === sku))
          const categoryPrefix = state.categories.find((c) => c.name === merged.category)?.prefix ?? generateCategoryPrefix(merged.category, [])
          merged.variants = variantPatch.map((variant) => {
            const existing = product.variants.find((item) => item.id === variant.id)
            if (variant.sku) {
              skusInUse.push(variant.sku)
              return materializeVariantImages(merged.id, {
                ...variant,
                status: existing?.status ?? variant.status,
                id: variant.id ?? generateId('var'),
                sku: variant.sku,
              })
            }
            const sku = generateSku(categoryPrefix, merged.material, merged.name, variant.size, skusInUse)
            skusInUse.push(sku)
            return materializeVariantImages(merged.id, { ...variant, id: variant.id ?? generateId('var'), sku })
          })
        }
        if (merged.isActive && !merged.variants.some((variant) => variant.status === 'active')) merged.isActive = false
        const images = assignCatalogImageStoragePaths(merged.id, normalizeCatalogProductImages(merged))
        return { ...merged, images, ...getCatalogProductImageAliases(images) }
      }),
    }))
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
    set((state) => ({ products: state.products.map((product) => {
      if (product.id !== productId) return product
      if (isActive && !product.variants.some((variant) => variant.status === 'active')) return product
      return { ...product, isActive }
    }) }))
  },

  setProductsActive: (productIds, isActive) => {
    if (!isSectionEditAuthorized('catalog')) return
    const idSet = new Set(productIds)
    set((state) => ({ products: state.products.map((product) => {
      if (!idSet.has(product.id)) return product
      if (isActive && !product.variants.some((variant) => variant.status === 'active')) return product
      return { ...product, isActive }
    }) }))
  },

  deleteProducts: (productIds) => {
    if (!isSectionEditAuthorized('catalog')) return
    const idSet = new Set(productIds)
    set((state) => {
      const removed = state.products.filter((product) => idSet.has(product.id))
      return {
        products: state.products.filter((product) => !idSet.has(product.id)),
        sizeGuideTargets: state.sizeGuideTargets.filter(
          (target) => target.scope !== 'product' || !idSet.has(target.productId),
        ),
        deletedProductIds: [...state.deletedProductIds, ...removed.map((product) => product.productId)],
      }
    })
  },
})
