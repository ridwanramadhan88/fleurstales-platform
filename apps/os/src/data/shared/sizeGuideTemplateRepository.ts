import './catalogVariantBatch1Types'
import type { SharedProduct, SharedProductImage, SharedSizeGuideTemplate } from './contracts'
import type { Json, ProductImageRow, ProductVariantRow, SizeGuideTemplateRow } from './databaseTypes'
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

const mapSizes = (client: SupabaseHttpClient, value: Json | undefined): SharedSizeGuideTemplateWithSizes['sizes'] => {
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
    const guideStoragePath = typeof record.guideStoragePath === 'string' && record.guideStoragePath.trim() ? record.guideStoragePath.trim() : undefined
    return [{
      id,
      name,
      ...(guideStoragePath ? { guideStoragePath, guidePublicUrl: client.storagePublicUrl('size-guides', guideStoragePath) } : {}),
      ...(typeof record.guideByteSize === 'number' ? { guideByteSize: record.guideByteSize } : {}),
      ...(typeof record.guideWidth === 'number' ? { guideWidth: record.guideWidth } : {}),
      ...(typeof record.guideHeight === 'number' ? { guideHeight: record.guideHeight } : {}),
      sortOrder: typeof record.sortOrder === 'number' ? record.sortOrder : index,
      isActive: typeof record.isActive === 'boolean' ? record.isActive : true,
    }]
  })
}

const mapTemplate = (client: SupabaseHttpClient, row: SizeGuideTemplateRowWithSizes): SharedSizeGuideTemplateWithSizes => ({
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

const listSizeGuideTemplatesWithSizes = async (client: SupabaseHttpClient): Promise<SharedSizeGuideTemplateWithSizes[]> => {
  const rows: SizeGuideTemplateRowWithSizes[] = await client.select('size_guide_templates', { order: [{ column: 'name' }] })
  return rows.map((row) => mapTemplate(client, row))
}

const productImageUrl = (client: SupabaseHttpClient, path: string): string => path.startsWith('demo/')
  ? `/catalog-demo/${path.split('/').pop() ?? ''}`
  : client.storagePublicUrl('product-images', path)

const mapProductImage = (client: SupabaseHttpClient, row: ProductImageRow): SharedProductImage => ({
  id: row.id,
  productId: row.product_id,
  variantId: row.variant_id ?? undefined,
  storagePath: row.storage_path,
  publicUrl: productImageUrl(client, row.storage_path),
  altText: row.alt_text ?? undefined,
  sortOrder: row.sort_order,
  isPrimary: row.is_primary,
  mimeType: row.mime_type,
  byteSize: row.byte_size ?? undefined,
  width: row.width ?? undefined,
  height: row.height ?? undefined,
})

const enrichProducts = async (client: SupabaseHttpClient, products: SharedProduct[], productId?: string): Promise<SharedProduct[]> => {
  const filters = productId ? { product_id: productId } : undefined
  const [variantRowsRaw, imageRowsRaw] = await Promise.all([
    client.select('product_variants', { filters, order: [{ column: 'sort_order' }] }),
    client.select('product_images', { filters, order: [{ column: 'sort_order' }] }),
  ])
  const variantRows = variantRowsRaw as ProductVariantRow[]
  const imageRows = imageRowsRaw as ProductImageRow[]
  const variantById = new Map(variantRows.map((row) => [row.id, row]))
  return products.map((product) => ({
    ...product,
    images: imageRows.filter((image) => image.product_id === product.id && !image.variant_id).map((image) => mapProductImage(client, image)),
    variants: product.variants.map((variant) => {
      const row = variantById.get(variant.id)
      return {
        ...variant,
        sizeOptionId: row?.size_option_id ?? undefined,
        images: imageRows.filter((image) => image.variant_id === variant.id).map((image) => mapProductImage(client, image)),
      }
    }),
  }))
}

export const asSizeGuideTemplateWithSizes = (template: SharedSizeGuideTemplate): SharedSizeGuideTemplateWithSizes => template as SharedSizeGuideTemplateWithSizes

export const createCatalogReadRepositoryWithSizeGuideSizes = (client: SupabaseHttpClient): CatalogReadRepository => {
  const base = createCatalogReadRepository(client)
  return {
    ...base,
    async listProducts(options) { return enrichProducts(client, await base.listProducts(options)) },
    async getProduct(productId) {
      const product = await base.getProduct(productId)
      if (!product) return null
      return (await enrichProducts(client, [product], productId))[0] ?? null
    },
    listSizeGuideTemplates: () => listSizeGuideTemplatesWithSizes(client),
  }
}

export const createCatalogAdminRepositoryWithSizeGuideSizes = (client: SupabaseHttpClient): CatalogAdminRepository => {
  const base = createCatalogAdminRepository(client)
  return {
    ...base,
    async listProducts(options) { return enrichProducts(client, await base.listProducts(options)) },
    async getProduct(productId) {
      const product = await base.getProduct(productId)
      if (!product) return null
      return (await enrichProducts(client, [product], productId))[0] ?? null
    },
    listSizeGuideTemplates: () => listSizeGuideTemplatesWithSizes(client),
  }
}