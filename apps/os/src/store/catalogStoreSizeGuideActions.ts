import type {
  CatalogSizeGuideSize,
  CatalogSizeGuideTarget,
  CatalogSizeGuideTemplate,
  CatalogStoreGet,
  CatalogStoreSet,
  CatalogStoreState,
} from './catalogStoreTypes'
import { generateId } from '../lib/id'
import { isSectionEditAuthorized } from '../config/authorization'
import { isSupabaseConfigured } from '../data/shared/supabaseConfig'

const STORAGE_KEY = 'fleurstales.catalog.size-guides.v1'
const BOUQUET_STANDARD_NAME = 'Bouquet Standard'
const DEFAULT_TEMPLATE_CREATED_AT = '2026-09-10T00:00:00.000Z'

export const BOUQUET_STANDARD_SIZES: CatalogSizeGuideSize[] = [
  { id: 'bouquet-standard-small', name: 'Small', sortOrder: 0, isActive: true },
  { id: 'bouquet-standard-medium', name: 'Medium', sortOrder: 1, isActive: true },
  { id: 'bouquet-standard-large', name: 'Large', sortOrder: 2, isActive: true },
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

const normalizeSize = (size: CatalogSizeGuideSize, index: number, legacy?: CatalogSizeGuideTemplate): CatalogSizeGuideSize => ({
  ...size,
  sortOrder: size.sortOrder ?? index,
  isActive: size.isActive ?? true,
  // Batch 1 compatibility: an old category-level guide remains visible for a
  // child until that child receives its own image.
  ...(size.guideImageUrl ? {} : legacy?.imageUrl ? {
    guideImageUrl: legacy.imageUrl,
    guideStoragePath: legacy.storagePath,
    guideByteSize: legacy.byteSize,
    guideWidth: legacy.width,
    guideHeight: legacy.height,
  } : {}),
})

const normalizeTemplate = (template: CatalogSizeGuideTemplate): CatalogSizeGuideTemplate => {
  const rawSizes = Array.isArray(template.sizes) && template.sizes.length > 0
    ? template.sizes
    : template.name.trim().toLowerCase() === BOUQUET_STANDARD_NAME.toLowerCase()
      ? BOUQUET_STANDARD_SIZES
      : []
  return { ...template, sizes: rawSizes.map((size, index) => normalizeSize(size, index, template)) }
}

interface PersistedSizeGuides {
  templates: CatalogSizeGuideTemplate[]
  targets: CatalogSizeGuideTarget[]
}

const persist = (state: Pick<CatalogStoreState, 'sizeGuideTemplates' | 'sizeGuideTargets'>) => {
  if (typeof localStorage === 'undefined') return
  if (isSupabaseConfigured()) {
    localStorage.removeItem(STORAGE_KEY)
    return
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ templates: state.sizeGuideTemplates, targets: state.sizeGuideTargets } satisfies PersistedSizeGuides))
}

export const loadPersistedSizeGuides = (): PersistedSizeGuides => {
  if (isSupabaseConfigured()) {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(STORAGE_KEY)
    return { templates: [defaultBouquetTemplate()], targets: [] }
  }
  if (typeof localStorage === 'undefined') return { templates: [defaultBouquetTemplate()], targets: [] }
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '') as Partial<PersistedSizeGuides>
    const templates = Array.isArray(parsed.templates) ? parsed.templates.map((template) => normalizeTemplate(template as CatalogSizeGuideTemplate)) : []
    return { templates: templates.length > 0 ? templates : [defaultBouquetTemplate()], targets: Array.isArray(parsed.targets) ? parsed.targets : [] }
  } catch {
    return { templates: [defaultBouquetTemplate()], targets: [] }
  }
}

type SizeGuideActions = Pick<CatalogStoreState,
  'saveSizeGuideTemplate' | 'addSizeGuideTemplateSize' | 'updateSizeGuideTemplateSize' |
  'archiveSizeGuideTemplateSize' | 'deleteSizeGuideTemplate' | 'assignSizeGuide' | 'removeSizeGuideTarget' |
  'applySizeGuideLibraryDraft'
>

export const createCatalogSizeGuideActions = (set: CatalogStoreSet, get: CatalogStoreGet): SizeGuideActions => ({
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
        imageUrl: input.imageUrl ?? existing?.imageUrl ?? '',
        storagePath: existing?.storagePath,
        byteSize: input.byteSize ?? existing?.byteSize ?? 0,
        width: 800,
        height: 800,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      }
      const next = {
        sizeGuideTemplates: existing ? state.sizeGuideTemplates.map((item) => item.id === id ? template : item) : [...state.sizeGuideTemplates, template],
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
      const next = {
        sizeGuideTemplates: state.sizeGuideTemplates.map((item) => item.id === templateId
          ? { ...item, sizes: [...item.sizes, { id: generateId('guide_size'), name: cleanName, sortOrder: item.sizes.length, isActive: true }], updatedAt: new Date().toISOString() }
          : item),
        sizeGuideTargets: state.sizeGuideTargets,
      }
      persist(next)
      return next
    })
    return added
  },

  updateSizeGuideTemplateSize: (templateId, sizeId, patch) => {
    if (!isSectionEditAuthorized('catalog')) return false
    let updated = false
    set((state) => {
      const template = state.sizeGuideTemplates.find((item) => item.id === templateId)
      if (!template) return state
      const cleanName = patch.name?.trim()
      if (patch.name !== undefined && !cleanName) return state
      if (cleanName && template.sizes.some((size) => size.id !== sizeId && size.name.toLowerCase() === cleanName.toLowerCase())) return state
      if (!template.sizes.some((size) => size.id === sizeId)) return state
      updated = true
      const next = {
        sizeGuideTemplates: state.sizeGuideTemplates.map((item) => item.id === templateId ? {
          ...item,
          sizes: item.sizes.map((size) => size.id === sizeId ? { ...size, ...patch, ...(cleanName ? { name: cleanName } : {}) } : size),
          updatedAt: new Date().toISOString(),
        } : item),
        sizeGuideTargets: state.sizeGuideTargets,
      }
      persist(next)
      return next
    })
    return updated
  },

  archiveSizeGuideTemplateSize: (templateId, sizeId) => {
    if (!isSectionEditAuthorized('catalog')) return false
    const inUseBySellableVariant = get().products.some((product) =>
      product.variants.some((variant) => variant.sizeOptionId === sizeId && variant.status === 'active'),
    )
    if (inUseBySellableVariant) return false
    return get().updateSizeGuideTemplateSize(templateId, sizeId, { isActive: false })
  },

  deleteSizeGuideTemplate: (templateId) => {
    if (!isSectionEditAuthorized('catalog')) return
    const state = get()
    const template = state.sizeGuideTemplates.find((item) => item.id === templateId)
    if (!template) return
    const hasAssignment = state.sizeGuideTargets.some((target) => target.templateId === templateId)
    const sizeIds = new Set(template.sizes.map((size) => size.id))
    const hasVariant = state.products.some((product) => product.variants.some((variant) => variant.sizeOptionId && sizeIds.has(variant.sizeOptionId)))
    if (hasAssignment || hasVariant) return
    set((current) => {
      const next = { sizeGuideTemplates: current.sizeGuideTemplates.filter((item) => item.id !== templateId), sizeGuideTargets: current.sizeGuideTargets }
      persist(next)
      return next
    })
  },

  assignSizeGuide: (input) => {
    if (!isSectionEditAuthorized('catalog')) return
    if (!get().sizeGuideTemplates.some((template) => template.id === input.templateId)) return
    set((state) => {
      const withoutSameTarget = state.sizeGuideTargets.filter((target) => input.scope === 'product'
        ? !(target.scope === 'product' && target.productId === input.productId)
        : !(target.scope === 'product_type' && target.productType === input.productType))
      const target: CatalogSizeGuideTarget = input.scope === 'product'
        ? { id: generateId('guide_target'), templateId: input.templateId, scope: 'product', productId: input.productId }
        : { id: generateId('guide_target'), templateId: input.templateId, scope: 'product_type', productType: input.productType }
      const next = { sizeGuideTemplates: state.sizeGuideTemplates, sizeGuideTargets: [...withoutSameTarget, target] }
      persist(next)
      return next
    })
  },

  removeSizeGuideTarget: (targetId) => {
    if (!isSectionEditAuthorized('catalog')) return
    set((state) => {
      const next = { sizeGuideTemplates: state.sizeGuideTemplates, sizeGuideTargets: state.sizeGuideTargets.filter((target) => target.id !== targetId) }
      persist(next)
      return next
    })
  },

  applySizeGuideLibraryDraft: ({ templates, targets }) => {
    if (!isSectionEditAuthorized('catalog')) return false

    const normalizedTemplates = templates.map((template) => normalizeTemplate({
      ...template,
      name: template.name.trim(),
      sizes: template.sizes.map((size, index) => normalizeSize(size, index)),
      updatedAt: template.updatedAt || new Date().toISOString(),
    }))
    if (normalizedTemplates.some((template) => !template.name)) return false

    const templateNames = normalizedTemplates.map((template) => template.name.toLowerCase())
    if (new Set(templateNames).size !== templateNames.length) return false

    for (const template of normalizedTemplates) {
      const names = template.sizes.map((size) => size.name.trim().toLowerCase())
      const ids = template.sizes.map((size) => size.id)
      if (names.some((name) => !name) || new Set(names).size !== names.length || new Set(ids).size !== ids.length) return false
    }

    const templateIds = new Set(normalizedTemplates.map((template) => template.id))
    if (targets.some((target) => !templateIds.has(target.templateId))) return false

    const archivedSizeIds = new Set(
      normalizedTemplates.flatMap((template) => template.sizes.filter((size) => size.isActive === false).map((size) => size.id)),
    )
    const activeReferenceToArchived = get().products.some((product) =>
      product.variants.some((variant) => variant.status === 'active' && variant.sizeOptionId && archivedSizeIds.has(variant.sizeOptionId)),
    )
    if (activeReferenceToArchived) return false

    const next = {
      sizeGuideTemplates: structuredClone(normalizedTemplates),
      sizeGuideTargets: structuredClone(targets),
    }
    set(next)
    persist(next)
    return true
  },
})

export const resolveCatalogSizeGuide = (
  product: Pick<CatalogStoreState['products'][number], 'id' | 'productType'>,
  templates: CatalogSizeGuideTemplate[],
  targets: CatalogSizeGuideTarget[],
  options?: { includeLogical?: boolean },
): CatalogSizeGuideTemplate | undefined => {
  const productTarget = targets.find((target) => target.scope === 'product' && target.productId === product.id)
  const typeTarget = product.productType ? targets.find((target) => target.scope === 'product_type' && target.productType === product.productType) : undefined
  const templateId = productTarget?.templateId ?? typeTarget?.templateId
  return templates.find((template) => template.id === templateId && (options?.includeLogical === true || template.sizes.some((size) => Boolean(size.guideImageUrl)) || template.byteSize > 0))
}

export const getDefaultCatalogSizeGuide = (templates: CatalogSizeGuideTemplate[]): CatalogSizeGuideTemplate | undefined =>
  templates.find((template) => template.name.trim().toLowerCase() === BOUQUET_STANDARD_NAME.toLowerCase()) ?? templates[0]
