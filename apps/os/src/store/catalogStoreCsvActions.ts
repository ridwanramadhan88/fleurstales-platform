/**
 * @file catalogStoreCsvActions.ts
 * @description CSV import/export actions for the shared Catalog contract.
 * Parsing/serialization lives in catalogCsvDomain; this module applies rows
 * without discarding Storefront metadata when a legacy CSV omits newer fields.
 */

import type {
  CatalogMaterial,
  CatalogStoreGet,
  CatalogStoreSet,
  CatalogStoreState,
  CatalogVariant,
  CsvImportSummary,
} from './catalogStoreTypes'
import { generateCategoryPrefix, generateSku } from '../domain/catalogIdDomain'
import {
  buildCatalogDisplayName,
  exportCatalogCsv,
  parseCatalogCsv,
  productMatchKey,
  type CatalogCsvOptionalField,
  type CatalogCsvRow,
} from '../domain/catalogCsvDomain'
import { allProductIds, allSkus, buildProduct } from './catalogStoreProductActions'
import { generateId } from '../lib/id'
import { isSectionEditAuthorized } from '../config/authorization'

type CsvActions = Pick<CatalogStoreState, 'importCsv' | 'exportCsv'>

const hasField = (row: CatalogCsvRow, field: CatalogCsvOptionalField): boolean =>
  row.providedFields.includes(field)

export const createCatalogCsvActions = (
  set: CatalogStoreSet,
  get: CatalogStoreGet,
): CsvActions => ({
  importCsv: (csvText) => {
    if (!isSectionEditAuthorized('catalog')) return { createdProducts: 0, updatedProducts: 0, createdVariants: 0, updatedVariants: 0, errors: [{ row: 0, message: 'This account cannot edit the catalog.' }] }
    const categoryNames = get().categories.map((category) => category.name)
    const { rows, errors } = parseCatalogCsv(csvText, categoryNames)
    const summary: CsvImportSummary = {
      createdProducts: 0,
      updatedProducts: 0,
      createdVariants: 0,
      updatedVariants: 0,
      errors,
    }

    set((state) => {
      let products = [...state.products]
      const deletedProductIds = state.deletedProductIds
      const touchedProducts = new Set<string>()
      const prefixForCategory = (category: string): string =>
        state.categories.find((item) => item.name === category)?.prefix ??
        generateCategoryPrefix(category, [])

      for (const row of rows) {
        const displayName = buildCatalogDisplayName(row.productName, row.collectionSeries)
        const key = productMatchKey(row.category, row.material, displayName)
        let existingIndex = row.productId
          ? products.findIndex((product) => product.productId === row.productId)
          : -1
        if (existingIndex === -1) {
          existingIndex = products.findIndex(
            (product) =>
              productMatchKey(product.category, product.material, product.name) === key,
          )
        }

        if (existingIndex === -1) {
          const newProduct = buildProduct(
            {
              category: row.category,
              occasionTags: row.occasionTags,
              productType: row.productType,
              collectionSeries: row.collectionSeries,
              pricingType: row.pricingType,
              orderType: row.orderType,
              material: row.material as CatalogMaterial,
              name: displayName,
              description: row.description,
              isActive: row.isActive ?? true,
              isFeatured: row.isFeatured ?? false,
              isCustomizable: row.isCustomizable ?? false,
              variants: [
                {
                  size: row.size,
                  price: row.price,
                  cost: row.cost,
                  status: row.variantStatus,
                },
              ],
            },
            prefixForCategory(row.category),
            allProductIds(products, deletedProductIds),
            allSkus(products),
          )
          products = [...products, newProduct]
          summary.createdProducts += 1
          summary.createdVariants += 1
          touchedProducts.add(newProduct.id)
          continue
        }

        const existing = products[existingIndex]
        if (!touchedProducts.has(existing.id)) {
          summary.updatedProducts += 1
          touchedProducts.add(existing.id)
        }

        const nextProduct = {
          ...existing,
          category: row.category,
          material: row.material,
          name: displayName,
          ...(hasField(row, 'occasionTags') ? { occasionTags: row.occasionTags } : {}),
          ...(hasField(row, 'productType') ? { productType: row.productType } : {}),
          ...(hasField(row, 'collectionSeries') ? { collectionSeries: row.collectionSeries } : {}),
          ...(hasField(row, 'pricingType') ? { pricingType: row.pricingType } : {}),
          ...(hasField(row, 'orderType') ? { orderType: row.orderType } : {}),
          ...(hasField(row, 'description') ? { description: row.description } : {}),
          ...(hasField(row, 'isActive') && row.isActive !== undefined ? { isActive: row.isActive } : {}),
          ...(hasField(row, 'isFeatured') && row.isFeatured !== undefined ? { isFeatured: row.isFeatured } : {}),
          ...(hasField(row, 'isCustomizable') && row.isCustomizable !== undefined ? { isCustomizable: row.isCustomizable } : {}),
        }

        const variantIndex = row.sku && hasField(row, 'sku')
          ? nextProduct.variants.findIndex((variant) => variant.sku === row.sku)
          : nextProduct.variants.findIndex(
              (variant) => variant.size.toLowerCase() === row.size.toLowerCase(),
            )

        if (variantIndex === -1) {
          const sku = generateSku(
            prefixForCategory(nextProduct.category),
            nextProduct.material,
            nextProduct.name,
            row.size,
            allSkus(products),
          )
          const newVariant: CatalogVariant = {
            id: generateId('var'),
            sku,
            size: row.size,
            price: row.price,
            cost: row.cost,
            status: row.variantStatus,
          }
          const updated = { ...nextProduct, variants: [...nextProduct.variants, newVariant] }
          products = products.map((product, index) =>
            index === existingIndex ? updated : product,
          )
          summary.createdVariants += 1
        } else {
          const currentVariant = nextProduct.variants[variantIndex]
          const updatedVariant: CatalogVariant = {
            ...currentVariant,
            size: row.size,
            price: row.price,
            ...(hasField(row, 'cost') ? { cost: row.cost } : {}),
            ...(hasField(row, 'variantStatus') ? { status: row.variantStatus } : {}),
          }
          const updated = {
            ...nextProduct,
            variants: nextProduct.variants.map((variant, index) =>
              index === variantIndex ? updatedVariant : variant,
            ),
          }
          products = products.map((product, index) =>
            index === existingIndex ? updated : product,
          )
          summary.updatedVariants += 1
        }
      }

      return { products }
    })

    return summary
  },

  exportCsv: () => exportCatalogCsv(get().products),
})
