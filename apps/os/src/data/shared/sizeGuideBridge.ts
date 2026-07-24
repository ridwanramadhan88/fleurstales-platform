import { useCatalogStore } from '../../store/catalogStore'
import type { CatalogSizeGuideTarget, CatalogSizeGuideTemplate } from '../../store/catalogStoreTypes'
import type { CatalogAdminRepository } from './repositoryContracts'
import type { SharedSizeGuideTarget, SharedSizeGuideTemplate } from './contracts'

const MAX_SIZE_GUIDE_BYTES = 100 * 1024

export const applyRemoteSizeGuideLibrary = (
  templates: SharedSizeGuideTemplate[],
  targets: SharedSizeGuideTarget[],
): void => {
  useCatalogStore.setState({
    sizeGuideTemplates: templates.map((template) => ({
      id: template.id,
      name: template.name,
      imageUrl: template.publicUrl,
      storagePath: template.storagePath,
      byteSize: template.byteSize,
      width: 800,
      height: 800,
      createdAt: template.createdAt ?? new Date().toISOString(),
      updatedAt: template.updatedAt ?? new Date().toISOString(),
    })),
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
): Promise<SharedSizeGuideTemplate> => {
  if (template.byteSize > MAX_SIZE_GUIDE_BYTES || template.width !== 800 || template.height !== 800) {
    throw new Error(`Size guide "${template.name}" must be an 800×800 JPEG no larger than 100 KB.`)
  }
  const storagePath = template.storagePath ?? `${template.id}.jpg`
  const shared: SharedSizeGuideTemplate = {
    id: template.id,
    name: template.name,
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
  return repository.uploadSizeGuide({ template: shared, blob })
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
