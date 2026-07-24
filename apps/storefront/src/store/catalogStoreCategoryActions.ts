/** Category mutations for the Catalog store. */
import type { CatalogStoreGet, CatalogStoreSet, CatalogStoreState } from './catalogStoreTypes'
import { generateId } from '../lib/id'
import {
  planCategoryRename,
  planCategoryUpdate,
  planNewCategory,
  validateCategoryDeletion,
} from '../domain/catalogCategoryDomain'
import { isSectionEditAuthorized } from '../config/authorization'

type CategoryActions = Pick<
  CatalogStoreState,
  'addCategory' | 'updateCategory' | 'renameCategory' | 'deleteCategory'
>

const fallbackCategory = { id: 'cat_uncategorized', name: 'Uncategorized', prefix: 'UNC' }

export const createCatalogCategoryActions = (
  set: CatalogStoreSet,
  get: CatalogStoreGet,
): CategoryActions => ({
  addCategory: (name, prefix) => {
    if (!isSectionEditAuthorized('catalog')) return { ok: false, reason: 'This account cannot edit the catalog.' }
    const plan = planNewCategory(name, get().categories, prefix)
    if (!plan.ok) return plan
    set((state) => ({
      categories: [...state.categories, { id: generateId('cat'), name: plan.name, prefix: plan.prefix }],
    }))
    return { ok: true }
  },

  updateCategory: (id, patch) => {
    if (!isSectionEditAuthorized('catalog')) return { ok: false, reason: 'This account cannot edit the catalog.' }
    const plan = planCategoryUpdate(id, patch.name, patch.prefix, get().categories)
    if (!plan.ok) return plan
    set((state) => ({
      categories: state.categories.map((category) =>
        category.id === id
          ? { ...category, name: plan.trimmedName, prefix: plan.prefix }
          : category,
      ),
      products: state.products.map((product) => ({
        ...product,
        category: product.category === plan.previousName ? plan.trimmedName : product.category,
        occasionTags: (product.occasionTags ?? [product.category]).map((occasion) =>
          occasion === plan.previousName ? plan.trimmedName : occasion,
        ),
      })),
    }))
    return { ok: true }
  },

  renameCategory: (id, name) => {
    if (!isSectionEditAuthorized('catalog')) return { ok: false, reason: 'This account cannot edit the catalog.' }
    const plan = planCategoryRename(id, name, get().categories)
    if (!plan.ok) return plan
    return get().updateCategory(id, { name: plan.trimmedName, prefix: plan.prefix })
  },

  deleteCategory: (id) => {
    if (!isSectionEditAuthorized('catalog')) return { ok: false, reason: 'This account cannot edit the catalog.' }
    const check = validateCategoryDeletion(id, get().categories, get().products)
    if (!check.ok) return check

    set((state) => {
      const hasFallback = state.categories.some((category) => category.name === fallbackCategory.name)
      return {
        categories: [
          ...state.categories.filter((category) => category.id !== id),
          ...(check.inactivePrimaryProductCount > 0 && !hasFallback ? [fallbackCategory] : []),
        ],
        products: state.products.map((product) => {
          const nextCategory = product.category === check.targetName ? fallbackCategory.name : product.category
          const nextOccasions = (product.occasionTags ?? [product.category]).filter((occasion) => occasion !== check.targetName)
          return { ...product, category: nextCategory, occasionTags: [...new Set([nextCategory, ...nextOccasions])] }
        }),
      }
    })
    return { ok: true }
  },
})
