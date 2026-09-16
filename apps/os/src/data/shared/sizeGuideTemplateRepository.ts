import type { SharedSizeGuideTemplate } from './contracts'
import type { Json, SizeGuideTemplateRow } from './databaseTypes'
import type { CatalogAdminRepository, CatalogReadRepository } from './repositoryContracts'
import { createCatalogAdminRepository, createCatalogReadRepository } from './repositories'
import { SupabaseHttpClient } from './supabaseHttpClient'

export interface SharedSizeGuideSizeWithGuide {
  id: string
  name: string
  guideStoragePath?: string
  guidePublicUrl?: string
  guideByteSize?: number
  guideWidth?: number
  guideHeight?: number
  sortOrder?: number
  isActive?: boolean
}

export interface SharedSizeGuideTemplateWithSizes extends SharedSizeGuideTemplate {
  sizes: SharedSizeGuideSizeWithGuide[]
}

type SizeGuideTemplateRowWithSizes = SizeGuideTemplateRow & { sizes?: Json }

const mapSizes = (
  client: SupabaseHttpClient,
  value: Json | undefined,
): SharedSizeGuideTemplateWithSizes['sizes'] => {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  return value.flatMap((raw, index) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return []
    const record = raw as Record<string, Json | undefined>
    const name = typeof record.name === 'string' ? record.name.trim() : ''
    const key = name.toLowerCase()
    if (!name || seen.has(key)) return []
    seen.add(key)
    const rawId = typeof record.id === 'string' ? record.id.trim() : ''
    const id = rawId || `guide-size-${index + 1}-${key.replace(/[^a-z0-9]+/g, '-')}`
    const guideStoragePath = typeof record.guideStoragePath === 'string' && record.guideStoragePath.trim()
      ? record.guideStoragePath.trim()
      : undefined
    return [{
      id,
      name,
      ...(guideStoragePath ? {
        guideStoragePath,
        guidePublicUrl: client.storagePublicUrl('size-guides', guideStoragePath),
      } : {}),
      ...(typeof record.guideByteSize === 'number' ? { guideByteSize: record.guideByteSize } : {}),
      ...(typeof record.guideWidth === 'number' ? { guideWidth: record.guideWidth } : {}),
      ...(typeof record.guideHeight === 'number' ? { guideHeight: record.guideHeight } : {}),
      sortOrder: typeof record.sortOrder === 'number' ? record.sortOrder : index,
      isActive: typeof record.isActive === 'boolean' ? record.isActive : true,
    }]
  })
}

const mapTemplate = (
  client: SupabaseHttpClient,
  row: SizeGuideTemplateRowWithSizes,
): SharedSizeGuideTemplateWithSizes => ({
  id: row.id,
  name: row.name,
  sizes: mapSizes(client, row.sizes),
  storagePath: row.storage_path,
  publicUrl: row.byte_size > 0 ? client.storagePublicUrl('size-guides', row.storage_path) : '',
  mimeType: row.mime_type,
  byteSize: row.byte_size,
  width: row.width,
  height: row.height,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
})

const listSizeGuideTemplatesWithSizes = async (
  client: SupabaseHttpClient,
): Promise<SharedSizeGuideTemplateWithSizes[]> => {
  const rows: SizeGuideTemplateRowWithSizes[] = await client.select('size_guide_templates', { order: [{ column: 'name' }] })
  return rows.map((row) => mapTemplate(client, row))
}

export const asSizeGuideTemplateWithSizes = (
  template: SharedSizeGuideTemplate,
): SharedSizeGuideTemplateWithSizes => template as SharedSizeGuideTemplateWithSizes

export const createCatalogReadRepositoryWithSizeGuideSizes = (
  client: SupabaseHttpClient,
): CatalogReadRepository => ({
  ...createCatalogReadRepository(client),
  listSizeGuideTemplates: () => listSizeGuideTemplatesWithSizes(client),
})

export const createCatalogAdminRepositoryWithSizeGuideSizes = (
  client: SupabaseHttpClient,
): CatalogAdminRepository => ({
  ...createCatalogAdminRepository(client),
  listSizeGuideTemplates: () => listSizeGuideTemplatesWithSizes(client),
})
