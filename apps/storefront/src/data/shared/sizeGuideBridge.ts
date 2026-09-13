import { useCatalogStore } from '../../store/catalogStore'
import type { CatalogSizeGuideSize, CatalogSizeGuideTarget, CatalogSizeGuideTemplate } from '../../store/catalogStoreTypes'
import type { CatalogAdminRepository } from './repositoryContracts'
import type { SharedSizeGuideTarget, SharedSizeGuideTemplate } from './contracts'
import { BOUQUET_STANDARD_SIZES } from '../../store/catalogStoreSizeGuideActions'
import {
  asSizeGuideTemplateWithSizes,
  type SharedSizeGuideTemplateWithSizes,
} from './sizeGuideTemplateRepository'

const MAX_SIZE_GUIDE_BYTES = 100 * 1024
const LEGACY_SIZE_METADATA_SEPARATOR = '|||sizes:'

const normalizeSizes = (sizes: Array<{ id: string; name: string }>): CatalogSizeGuideSize[] => {
  const seen = new Set<string>()
  return sizes.flatMap((size, index) => {
    const name = size.name.trim()
    const key = name.toLowerCase()
    if (!name || seen.has(key)) return []
    seen.add(key)
    const id = size.id?.trim() || `guide-size-${index + 1}-${key.replace(/[^a-z0-9]+/g, '-')}`
    return [{ id, name }]
  })
}

const readRemoteTemplate = (
  template: SharedSizeGuideTemplate,
): { name: string; sizes: CatalogSizeGuideSize[] } => {
  const [rawName, legacyRawSizes] = template.name.split(LEGACY_SIZE_METADATA_SEPARATOR, 2)
  const name = rawName.trim()
  const persistedSizes = asSizeGuideTemplateWithSizes(template).sizes ?? []
  if (persistedSizes.length > 0) return { name, sizes: normalizeSizes(persistedSizes) }

  const legacySizes = legacyRawSizes
    ?.split('|')
    .map((value, index) => ({
      id: `${template.id}-size-${index + 1}-${value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
      name: value.trim(),
    }))
    .filter((size) => Boolean(size.name)) ?? []
  if (legacySizes.length > 0) return { name, sizes: normalizeSizes(legacySizes) }

  if (name.toLowerCase() === 'bouquet standard') {
    return { name, sizes: BOUQUET_STANDARD_SIZES.map((item) => ({ ...item })) }
  }
  return { name, sizes: [] }
}

export const applyRemoteSizeGuideLibrary = (
  templates: SharedSizeGuideTemplate[],
  targets: SharedSizeGuideTarget[],
): void => {
  useCatalogStore.setState({
    sizeGuideTemplates: templates.map((template) => {
      const resolved = readRemoteTemplate(template)
      return {
        id: template.id,
        name: resolved.name,
        sizes: resolved.sizes,
        imageUrl: template.publicUrl,
        storagePath: template.storagePath,
        byteSize: template.byteSize,
        width: 800,
        height: 800,
        createdAt: template.createdAt ?? new Date().toISOString(),
        updatedAt: template.updatedAt ?? new Date().toISOString(),
      }
    }),
    sizeGuideTargets: targets.map((target): CatalogSizeGuideTarget => target.scope === 'product'
      ? { id: target.id, templateId: target.templateId, scope: 'product', productId: target.productId }
      : { id: target.id, templateId: target.templateId, scope: 'product_type', productType: target.productType }),
  })
}

const toSharedTarget = (target: CatalogSizeGuideTarget): SharedSizeGuideTarget => target.scope === 'product'
  ? { id: target.id, templateId: target.templateId, scope: 'product', productId: target.productId }
  : { id: target.id, templateId: target.templateId, scope: 'product_type', productType: target.productType }

const prepareTemplate = async (
  repository: CatalogAdminRepository,
  template: CatalogSizeGuideTemplate,
): Promise<SharedSizeGuideTemplateWithSizes> => {
  if (template.byteSize > MAX_SIZE_GUIDE_BYTES || template.width !== 800 || template.height !== 800) {
    throw new Error(`Size guide "${template.name}" must be an 800×800 JPEG no larger than 100 KB.`)
  }
  const storagePath = template.storagePath ?? `${template.id}.jpg`
  const shared: SharedSizeGuideTemplateWithSizes = {
    id: template.id,
    name: template.name.trim(),
    sizes: normalizeSizes(template.sizes),
    storagePath,
    publicUrl: template.imageUrl,
    mimeType: 'image/jpeg',
    byteSize: template.byteSize,
    width: 800,
    height: 800,
    createdAt: template.createdAt,
    updatedAt: template.updatedAt,
  }
  if (!template.imageUrl.startsWith('data:image/')) return shared
  const response = await fetch(template.imageUrl)
  const blob = await response.blob()
  if (blob.size > MAX_SIZE_GUIDE_BYTES) throw new Error(`Size guide "${template.name}" exceeds 100 KB.`)
  const uploaded = await repository.uploadSizeGuide({ template: shared, blob })
  return { ...uploaded, sizes: shared.sizes }
}

export const syncLocalSizeGuideLibrary = async (repository: CatalogAdminRepository): Promise<void> => {
  const state = useCatalogStore.getState()
  const previous = await repository.listSizeGuideTemplates()
  const templates = await Promise.all(state.sizeGuideTemplates.map((template) => prepareTemplate(repository, template)))
  const targets = state.sizeGuideTargets.map(toSharedTarget)
  await repository.replaceSizeGuideLibrary({ templates, targets })

  const activePaths = new Set(templates.map((template) => template.storagePath))
  const removedPaths = previous.map((template) => template.storagePath).filter((path) => !activePaths.has(path))
  if (removedPaths.length > 0) await repository.removeSizeGuideObjects(removedPaths)
  applyRemoteSizeGuideLibrary(templates, targets)
}
