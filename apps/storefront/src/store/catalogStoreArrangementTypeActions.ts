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
    if (!isSectionEditAuthorized('catalog')) return { ok: false, reason: 'Akun ini tidak dapat mengedit Catalog.' }
    const nextName = normalizedName(name)
    if (!nextName) return { ok: false, reason: 'Nama Jenis rangkaian wajib diisi.' }
    if (nextName.length > 80) return { ok: false, reason: 'Nama Jenis rangkaian maksimal 80 karakter.' }
    if (get().arrangementTypes.some((item) => item.toLowerCase() === nextName.toLowerCase())) {
      return { ok: false, reason: `"${nextName}" sudah ada.` }
    }
    set((state) => ({ arrangementTypes: [...state.arrangementTypes, nextName] }))
    return { ok: true }
  },

  renameArrangementType: (currentName, nextValue) => {
    if (!isSectionEditAuthorized('catalog')) return { ok: false, reason: 'Akun ini tidak dapat mengedit Catalog.' }
    const nextName = normalizedName(nextValue)
    if (!nextName) return { ok: false, reason: 'Nama Jenis rangkaian wajib diisi.' }
    if (nextName.length > 80) return { ok: false, reason: 'Nama Jenis rangkaian maksimal 80 karakter.' }
    if (!get().arrangementTypes.includes(currentName)) return { ok: false, reason: 'Jenis rangkaian tidak ditemukan.' }
    if (get().arrangementTypes.some((item) => item !== currentName && item.toLowerCase() === nextName.toLowerCase())) {
      return { ok: false, reason: `"${nextName}" sudah ada.` }
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
    if (!isSectionEditAuthorized('catalog')) return { ok: false, reason: 'Akun ini tidak dapat mengedit Catalog.' }
    const usageCount = get().products.filter((product) => product.productType === name).length
    if (usageCount > 0) {
      return { ok: false, reason: `Jenis rangkaian ini masih dipakai oleh ${usageCount} produk.` }
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
