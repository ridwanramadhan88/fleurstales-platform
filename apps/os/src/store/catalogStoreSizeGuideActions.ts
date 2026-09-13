import type {
  CatalogSizeGuideSize,
  CatalogSizeGuideTarget,
  CatalogSizeGuideTemplate,
  CatalogStoreSet,
  CatalogStoreState,
} from './catalogStoreTypes'
import { generateId } from '../lib/id'
import { isSectionEditAuthorized } from '../config/authorization'

const STORAGE_KEY = 'fleurstales.catalog.size-guides.v1'
const BOUQUET_STANDARD_NAME = 'Bouquet Standard'
const DEFAULT_TEMPLATE_CREATED_AT = '2026-09-10T00:00:00.000Z'

export const BOUQUET_STANDARD_SIZES: CatalogSizeGuideSize[] = [
  { id: 'bouquet-standard-small', name: 'Small' },
  { id: 'bouquet-standard-medium', name: 'Medium' },
  { id: 'bouquet-standard-large', name: 'Large' },
]

const defaultBouquetTemplate = (): CatalogSizeGuideTemplate => ({
  id: 'guide-bouquet-standard',
  name: BOUQUET_STANDARD_NAME,
  sizes: BOUQUET_STANDARD_SIZES.map((item) => ({ ...item })),
  imageUrl: '',
  storagePath: 'logical/bouquet-standard.jpg',
  byteSize: 0,
  width: 800,
  height: 800,
  createdAt: DEFAULT_TEMPLATE_CREATED_AT,
  updatedAt: DEFAULT_TEMPLATE_CREATED_AT,
})

const normalizeTemplate = (template: CatalogSizeGuideTemplate): CatalogSizeGuideTemplate => ({
  ...template,
  sizes: Array.isArray(template.sizes) && template.sizes.length > 0
    ? template.sizes
    : template.name.trim().toLowerCase() === BOUQUET_STANDARD_NAME.toLowerCase()
      ? BOUQUET_STANDARD_SIZES.map((item) => ({ ...item }))
      : [],
})

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
  if (typeof localStorage === 'undefined') return { templates: [defaultBouquetTemplate()], targets: [] }
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '') as Partial<PersistedSizeGuides>
    const templates = Array.isArray(parsed.templates)
      ? parsed.templates.map((template) => normalizeTemplate(template as CatalogSizeGuideTemplate))
      : []
    return {
      templates: templates.length > 0 ? templates : [defaultBouquetTemplate()],
      targets: Array.isArray(parsed.targets) ? parsed.targets : [],
    }
  } catch {
    return { templates: [defaultBouquetTemplate()], targets: [] }
  }
}

type SizeGuideActions = Pick<
  CatalogStoreState,
  'saveSizeGuideTemplate' | 'addSizeGuideTemplateSize' | 'deleteSizeGuideTemplate' | 'assignSizeGuide' | 'removeSizeGuideTarget'
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
        sizes: existing?.sizes ?? [],
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

  addSizeGuideTemplateSize: (templateId, name) => {
    if (!isSectionEditAuthorized('catalog')) return false
    const cleanName = name.trim()
    if (!cleanName) return false
    let added = false
    set((state) => {
      const template = state.sizeGuideTemplates.find((item) => item.id === templateId)
      if (!template || template.sizes.some((item) => item.name.toLowerCase() === cleanName.toLowerCase())) return state
      added = true
      const now = new Date().toISOString()
      const next = {
        sizeGuideTemplates: state.sizeGuideTemplates.map((item) => item.id === templateId
          ? { ...item, sizes: [...item.sizes, { id: generateId('guide_size'), name: cleanName }], updatedAt: now }
          : item),
        sizeGuideTargets: state.sizeGuideTargets,
      }
      persist(next)
      return next
    })
    return added
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
  options?: { includeLogical?: boolean },
): CatalogSizeGuideTemplate | undefined => {
  const productTarget = targets.find((target) => target.scope === 'product' && target.productId === product.id)
  const typeTarget = product.productType
    ? targets.find((target) => target.scope === 'product_type' && target.productType === product.productType)
    : undefined
  const templateId = productTarget?.templateId ?? typeTarget?.templateId
  return templates.find((template) =>
    template.id === templateId && (options?.includeLogical === true || template.byteSize > 0),
  )
}

export const getDefaultCatalogSizeGuide = (templates: CatalogSizeGuideTemplate[]): CatalogSizeGuideTemplate | undefined =>
  templates.find((template) => template.name.trim().toLowerCase() === BOUQUET_STANDARD_NAME.toLowerCase()) ?? templates[0]
