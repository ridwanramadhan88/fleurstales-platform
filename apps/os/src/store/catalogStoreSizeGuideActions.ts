import type {
  CatalogSizeGuideTarget,
  CatalogSizeGuideTemplate,
  CatalogStoreSet,
  CatalogStoreState,
} from './catalogStoreTypes'
import { generateId } from '../lib/id'
import { isSectionEditAuthorized } from '../config/authorization'

const STORAGE_KEY = 'fleurstales.catalog.size-guides.v1'

interface PersistedSizeGuides {
  templates: CatalogSizeGuideTemplate[]
  targets: CatalogSizeGuideTarget[]
}

const persist = (state: Pick<CatalogStoreState, 'sizeGuideTemplates' | 'sizeGuideTargets'>) => {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    templates: state.sizeGuideTemplates,
    targets: state.sizeGuideTargets,
  } satisfies PersistedSizeGuides))
}

export const loadPersistedSizeGuides = (): PersistedSizeGuides => {
  if (typeof localStorage === 'undefined') return { templates: [], targets: [] }
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '') as Partial<PersistedSizeGuides>
    return {
      templates: Array.isArray(parsed.templates) ? parsed.templates : [],
      targets: Array.isArray(parsed.targets) ? parsed.targets : [],
    }
  } catch {
    return { templates: [], targets: [] }
  }
}

type SizeGuideActions = Pick<
  CatalogStoreState,
  'saveSizeGuideTemplate' | 'deleteSizeGuideTemplate' | 'assignSizeGuide' | 'removeSizeGuideTarget'
>

export const createCatalogSizeGuideActions = (set: CatalogStoreSet): SizeGuideActions => ({
  saveSizeGuideTemplate: (input) => {
    if (!isSectionEditAuthorized('catalog')) return ''
    const id = input.id ?? generateId('guide')
    const now = new Date().toISOString()
    set((state) => {
      const existing = state.sizeGuideTemplates.find((template) => template.id === id)
      const template: CatalogSizeGuideTemplate = {
        id,
        name: input.name.trim(),
        imageUrl: input.imageUrl,
        storagePath: existing?.storagePath,
        byteSize: input.byteSize,
        width: 800,
        height: 800,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      }
      const next = {
        sizeGuideTemplates: existing
          ? state.sizeGuideTemplates.map((item) => item.id === id ? template : item)
          : [...state.sizeGuideTemplates, template],
        sizeGuideTargets: state.sizeGuideTargets,
      }
      persist(next)
      return next
    })
    return id
  },

  deleteSizeGuideTemplate: (templateId) => {
    if (!isSectionEditAuthorized('catalog')) return
    set((state) => {
      const next = {
        sizeGuideTemplates: state.sizeGuideTemplates.filter((template) => template.id !== templateId),
        sizeGuideTargets: state.sizeGuideTargets.filter((target) => target.templateId !== templateId),
      }
      persist(next)
      return next
    })
  },

  assignSizeGuide: (input) => {
    if (!isSectionEditAuthorized('catalog')) return
    set((state) => {
      const withoutSameTarget = state.sizeGuideTargets.filter((target) =>
        input.scope === 'product'
          ? !(target.scope === 'product' && target.productId === input.productId)
          : !(target.scope === 'product_type' && target.productType === input.productType),
      )
      const target: CatalogSizeGuideTarget = input.scope === 'product'
        ? { id: generateId('guide_target'), templateId: input.templateId, scope: 'product', productId: input.productId }
        : { id: generateId('guide_target'), templateId: input.templateId, scope: 'product_type', productType: input.productType }
      const next = {
        sizeGuideTemplates: state.sizeGuideTemplates,
        sizeGuideTargets: [...withoutSameTarget, target],
      }
      persist(next)
      return next
    })
  },

  removeSizeGuideTarget: (targetId) => {
    if (!isSectionEditAuthorized('catalog')) return
    set((state) => {
      const next = {
        sizeGuideTemplates: state.sizeGuideTemplates,
        sizeGuideTargets: state.sizeGuideTargets.filter((target) => target.id !== targetId),
      }
      persist(next)
      return next
    })
  },
})

export const resolveCatalogSizeGuide = (
  product: Pick<CatalogStoreState['products'][number], 'id' | 'productType'>,
  templates: CatalogSizeGuideTemplate[],
  targets: CatalogSizeGuideTarget[],
): CatalogSizeGuideTemplate | undefined => {
  const productTarget = targets.find((target) => target.scope === 'product' && target.productId === product.id)
  const typeTarget = product.productType
    ? targets.find((target) => target.scope === 'product_type' && target.productType === product.productType)
    : undefined
  const templateId = productTarget?.templateId ?? typeTarget?.templateId
  return templates.find((template) => template.id === templateId)
}
