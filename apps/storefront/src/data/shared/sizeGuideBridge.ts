import { useCatalogStore } from '../../store/catalogStore'
import type { CatalogSizeGuideSize, CatalogSizeGuideTarget, CatalogSizeGuideTemplate, CatalogStoreState } from '../../store/catalogStoreTypes'
import type { CatalogAdminRepository } from './repositoryContracts'
import type { SharedSizeGuideTarget, SharedSizeGuideTemplate } from './contracts'
import { BOUQUET_STANDARD_SIZES } from '../../store/catalogStoreSizeGuideActions'
import {
  asSizeGuideTemplateWithSizes,
  type SharedSizeGuideSizeWithGuide,
  type SharedSizeGuideTemplateWithSizes,
} from './sizeGuideTemplateRepository'

const MAX_SIZE_GUIDE_BYTES = 100 * 1024
const LEGACY_SIZE_METADATA_SEPARATOR = '|||sizes:'

const safeSegment = (value: string): string =>
  value.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'size'

const normalizeSizes = (sizes: CatalogSizeGuideSize[]): CatalogSizeGuideSize[] => {
  const seen = new Set<string>()
  return sizes.flatMap((size, index) => {
    const name = size.name.trim()
    const key = name.toLowerCase()
    if (!name || seen.has(key)) return []
    seen.add(key)
    return [{
      ...size,
      id: size.id?.trim() || `guide-size-${index + 1}-${key.replace(/[^a-z0-9]+/g, '-')}`,
      name,
      sortOrder: size.sortOrder ?? index,
      isActive: size.isActive ?? true,
    }]
  })
}

const readRemoteTemplate = (
  template: SharedSizeGuideTemplate,
): { name: string; sizes: CatalogSizeGuideSize[] } => {
  const [rawName, legacyRawSizes] = template.name.split(LEGACY_SIZE_METADATA_SEPARATOR, 2)
  const name = rawName.trim()
  const persistedSizes = asSizeGuideTemplateWithSizes(template).sizes ?? []
  if (persistedSizes.length > 0) {
    return {
      name,
      sizes: normalizeSizes(persistedSizes.map((size) => ({
        id: size.id,
        name: size.name,
        guideImageUrl: size.guidePublicUrl,
        guideStoragePath: size.guideStoragePath,
        guideByteSize: size.guideByteSize,
        guideWidth: size.guideWidth,
        guideHeight: size.guideHeight,
        sortOrder: size.sortOrder,
        isActive: size.isActive,
      }))),
    }
  }

  const legacySizes = legacyRawSizes
    ?.split('|')
    .map((value, index) => ({
      id: `${template.id}-size-${index + 1}-${value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
      name: value.trim(),
      sortOrder: index,
      isActive: true,
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

interface PreparedSizeGuideTemplate {
  template: SharedSizeGuideTemplateWithSizes
  uploadedPaths: string[]
}

const uploadChildGuide = async (
  repository: CatalogAdminRepository,
  template: CatalogSizeGuideTemplate,
  size: CatalogSizeGuideSize,
): Promise<{ size: CatalogSizeGuideSize; uploadedPath?: string }> => {
  if (!size.guideImageUrl?.startsWith('data:image/')) return { size }
  const response = await fetch(size.guideImageUrl)
  const blob = await response.blob()
  if (blob.type !== 'image/jpeg') throw new Error(`Panduan ukuran ${template.name} · ${size.name} harus berupa JPEG.`)
  if (blob.size > MAX_SIZE_GUIDE_BYTES) throw new Error(`Panduan ukuran ${template.name} · ${size.name} melebihi 100 KB.`)
  const storagePath = `${safeSegment(template.id)}/${safeSegment(size.id)}-${Date.now()}.jpg`
  const uploaded = await repository.uploadSizeGuide({
    template: {
      id: size.id,
      name: `${template.name} · ${size.name}`,
      storagePath,
      publicUrl: size.guideImageUrl,
      mimeType: 'image/jpeg',
      byteSize: blob.size,
      width: 800,
      height: 800,
    },
    blob,
  })
  return {
    size: {
      ...size,
      guideImageUrl: uploaded.publicUrl,
      guideStoragePath: storagePath,
      guideByteSize: blob.size,
      guideWidth: 800,
      guideHeight: 800,
    },
    uploadedPath: storagePath,
  }
}

const prepareTemplate = async (
  repository: CatalogAdminRepository,
  template: CatalogSizeGuideTemplate,
): Promise<PreparedSizeGuideTemplate> => {
  const prepared = await Promise.all(normalizeSizes(template.sizes).map((size) => uploadChildGuide(repository, template, size)))
  const preparedSizes = prepared.map((item) => item.size)
  const sizes: SharedSizeGuideSizeWithGuide[] = preparedSizes.map((size) => ({
    id: size.id,
    name: size.name,
    guideStoragePath: size.guideStoragePath,
    guidePublicUrl: size.guideImageUrl,
    guideByteSize: size.guideByteSize,
    guideWidth: size.guideWidth,
    guideHeight: size.guideHeight,
    sortOrder: size.sortOrder,
    isActive: size.isActive,
  }))

  const storagePath = template.storagePath ?? `logical/${safeSegment(template.id)}.jpg`
  return {
    template: {
      id: template.id,
      name: template.name.trim(),
      sizes,
      storagePath,
      publicUrl: template.imageUrl,
      mimeType: 'image/jpeg',
      byteSize: template.byteSize,
      width: 800,
      height: 800,
      createdAt: template.createdAt,
      updatedAt: template.updatedAt,
    },
    uploadedPaths: prepared.flatMap((item) => item.uploadedPath ? [item.uploadedPath] : []),
  }
}

export const syncSizeGuideLibrary = async (
  repository: CatalogAdminRepository,
  input: Pick<CatalogStoreState, 'sizeGuideTemplates' | 'sizeGuideTargets'>,
): Promise<void> => {
  const previous = await repository.listSizeGuideTemplates()
  const previousChildPaths = previous.flatMap((template) =>
    (asSizeGuideTemplateWithSizes(template).sizes ?? []).flatMap((size) => size.guideStoragePath ? [size.guideStoragePath] : []),
  )

  const prepared = await Promise.all(input.sizeGuideTemplates.map((template) => prepareTemplate(repository, template)))
  const templates = prepared.map((item) => item.template)
  const uploadedPaths = prepared.flatMap((item) => item.uploadedPaths)
  const targets = input.sizeGuideTargets.map(toSharedTarget)

  try {
    await repository.replaceSizeGuideLibrary({ templates, targets })
  } catch (error) {
    if (uploadedPaths.length > 0) {
      try { await repository.removeSizeGuideObjects([...new Set(uploadedPaths)]) } catch { /* best-effort orphan cleanup */ }
    }
    throw error
  }

  const activePaths = new Set([
    ...templates.filter((template) => template.byteSize > 0).map((template) => template.storagePath),
    ...templates.flatMap((template) => template.sizes.flatMap((size) => size.guideStoragePath ? [size.guideStoragePath] : [])),
  ])
  const removedPaths = [
    ...previous.filter((template) => template.byteSize > 0).map((template) => template.storagePath),
    ...previousChildPaths,
  ].filter((path) => !activePaths.has(path))
  if (removedPaths.length > 0) {
    try { await repository.removeSizeGuideObjects([...new Set(removedPaths)]) } catch { /* best-effort cleanup after committed metadata */ }
  }
  applyRemoteSizeGuideLibrary(templates, targets)
}

export const syncLocalSizeGuideLibrary = async (repository: CatalogAdminRepository): Promise<void> => {
  const state = useCatalogStore.getState()
  await syncSizeGuideLibrary(repository, {
    sizeGuideTemplates: state.sizeGuideTemplates,
    sizeGuideTargets: state.sizeGuideTargets,
  })
}