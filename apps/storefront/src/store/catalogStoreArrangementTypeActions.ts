import { isSectionEditAuthorized } from '../config/authorization'
import type { CatalogStoreGet, CatalogStoreSet, CatalogStoreState } from './catalogStoreTypes'

type ArrangementTypeActions = Pick<
  CatalogStoreState,
  'addArrangementType' | 'renameArrangementType' | 'deleteArrangementType'
>

const normalizedName = (value: string): string => value.trim().replace(/\s+/g, ' ')

export const createCatalogArrangementTypeActions = (
  set: CatalogStoreSet,
  get: CatalogStoreGet,
): ArrangementTypeActions => ({
  addArrangementType: (name) => {
    if (!isSectionEditAuthorized('catalog')) return { ok: false, reason: 'This account cannot edit the catalog.' }
    const nextName = normalizedName(name)
    if (!nextName) return { ok: false, reason: 'Arrangement type name is required.' }
    if (nextName.length > 80) return { ok: false, reason: 'Arrangement type names must be 80 characters or fewer.' }
    if (get().arrangementTypes.some((item) => item.toLowerCase() === nextName.toLowerCase())) {
      return { ok: false, reason: `"${nextName}" already exists.` }
    }
    set((state) => ({ arrangementTypes: [...state.arrangementTypes, nextName] }))
    return { ok: true }
  },

  renameArrangementType: (currentName, nextValue) => {
    if (!isSectionEditAuthorized('catalog')) return { ok: false, reason: 'This account cannot edit the catalog.' }
    const nextName = normalizedName(nextValue)
    if (!nextName) return { ok: false, reason: 'Arrangement type name is required.' }
    if (nextName.length > 80) return { ok: false, reason: 'Arrangement type names must be 80 characters or fewer.' }
    if (!get().arrangementTypes.includes(currentName)) return { ok: false, reason: 'Arrangement type not found.' }
    if (get().arrangementTypes.some((item) => item !== currentName && item.toLowerCase() === nextName.toLowerCase())) {
      return { ok: false, reason: `"${nextName}" already exists.` }
    }
    set((state) => ({
      arrangementTypes: state.arrangementTypes.map((item) => item === currentName ? nextName : item),
      products: state.products.map((product) => product.productType === currentName
        ? { ...product, productType: nextName }
        : product),
      sizeGuideTargets: state.sizeGuideTargets.map((target) =>
        target.scope === 'product_type' && target.productType === currentName
          ? { ...target, productType: nextName }
          : target),
    }))
    return { ok: true }
  },

  deleteArrangementType: (name) => {
    if (!isSectionEditAuthorized('catalog')) return { ok: false, reason: 'This account cannot edit the catalog.' }
    const usageCount = get().products.filter((product) => product.productType === name).length
    if (usageCount > 0) {
      return { ok: false, reason: `This arrangement type is used by ${usageCount} product${usageCount === 1 ? '' : 's'}.` }
    }
    set((state) => ({
      arrangementTypes: state.arrangementTypes.filter((item) => item !== name),
      sizeGuideTargets: state.sizeGuideTargets.filter(
        (target) => !(target.scope === 'product_type' && target.productType === name),
      ),
    }))
    return { ok: true }
  },
})
