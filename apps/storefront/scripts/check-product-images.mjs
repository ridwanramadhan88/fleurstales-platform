import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const required = [
  'src/domain/catalogImageDomain.ts',
  'src/data/shared/catalogImageBridge.ts',
  'src/components/catalog/CatalogProductImagesField.tsx',
  'supabase/migrations/20260724164006_product_images.sql',
]
for (const file of required) {
  if (!fs.existsSync(path.join(root, file))) {
    console.error(`Missing Phase 5 file: ${file}`)
    process.exit(1)
  }
}

const migration = fs.readFileSync(path.join(root, 'supabase/migrations/20260724164006_product_images.sql'), 'utf8')
const domain = fs.readFileSync(path.join(root, 'src/domain/catalogImageDomain.ts'), 'utf8')
const bridge = fs.readFileSync(path.join(root, 'src/data/shared/catalogImageBridge.ts'), 'utf8')
const types = fs.readFileSync(path.join(root, 'src/store/catalogStoreTypes.ts'), 'utf8')
const repositories = fs.readFileSync(path.join(root, 'src/data/shared/repositories.ts'), 'utf8')
const client = fs.readFileSync(path.join(root, 'src/data/shared/supabaseHttpClient.ts'), 'utf8')

for (const token of [
  'replace_product_images_metadata',
  'mime_type',
  'byte_size',
  'width',
  'height',
  '102400',
  'product_images_storage_staff_select',
]) {
  if (!migration.includes(token)) {
    console.error(`Phase 5 migration missing: ${token}`)
    process.exit(1)
  }
}

for (const token of [
  'CATALOG_IMAGE_MAX_COUNT = 6',
  'CATALOG_IMAGE_MAX_BYTES = 100 * 1024',
  'normalizeCatalogProductImages',
  'prepareCatalogImageUpload',
  'assignCatalogImageStoragePaths',
]) {
  if (!domain.includes(token)) {
    console.error(`Catalog image domain missing: ${token}`)
    process.exit(1)
  }
}

if (!types.includes('export interface CatalogProductImage')) {
  console.error('Catalog product image metadata type is missing.')
  process.exit(1)
}
if (!bridge.includes('buildCatalogImageStoragePlan') || !bridge.includes('syncCatalogProductImagesToRemote')) {
  console.error('Local/remote product image adapter boundary is incomplete.')
  process.exit(1)
}
if (!repositories.includes('replaceProductImagesMetadata') || !repositories.includes('uploadProductImage')) {
  console.error('Catalog admin repository is missing Storage/image metadata mutations.')
  process.exit(1)
}
if (!client.includes('uploadStorageObject') || !client.includes('removeStorageObjects')) {
  console.error('Supabase HTTP transport is missing Storage upload/remove support.')
  process.exit(1)
}

const imageField = fs.readFileSync(path.join(root, 'src/components/catalog/CatalogProductImagesField.tsx'), 'utf8')
if (imageField.includes('storagePath: image.storagePath')) {
  console.error('Image replacement must not reuse the old Storage object path before revision acceptance.')
  process.exit(1)
}
if ((imageField.match(/id: generateId\('img'\)/g) ?? []).length < 2) {
  console.error('Both image replacement and append flows must allocate a fresh image identity.')
  process.exit(1)
}

const isStorefront = fs.existsSync(path.join(root, 'src/components/storefront/storefrontDummyImages.ts'))
if (isStorefront) {
  const helperPath = path.join(root, 'src/components/storefront/storefrontProductImages.ts')
  if (!fs.existsSync(helperPath)) {
    console.error('Storefront canonical-first product image resolver is missing.')
    process.exit(1)
  }
  const helper = fs.readFileSync(helperPath, 'utf8')
  if (!helper.includes('getCatalogProductPrimaryImageUrl') || !helper.includes('getStorefrontDummyThumbnail')) {
    console.error('Storefront image resolver must prefer canonical images and retain fallback photography.')
    process.exit(1)
  }
  for (const relative of [
    'src/components/storefront/StorefrontProductCard.tsx',
    'src/pages/StorefrontProductDetailPage.tsx',
    'src/components/storefront/CartDrawerCartStep.tsx',
    'src/components/storefront/CartDrawerReviewStep.tsx',
  ]) {
    const source = fs.readFileSync(path.join(root, relative), 'utf8')
    if (source.includes("from './storefrontDummyImages'") || source.includes('from "../components/storefront/storefrontDummyImages"')) {
      console.error(`${relative} still bypasses the canonical product-image resolver.`)
      process.exit(1)
    }
  }
}

console.log('Phase 5 product-image check passed.')
