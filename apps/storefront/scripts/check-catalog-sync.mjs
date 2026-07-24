import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'

const root = process.cwd()
const required = [
  'src/data/shared/catalogBridge.ts',
  'src/data/shared/supabaseSession.ts',
  'supabase/migrations/20260724163946_catalog_sync.sql',
  'supabase/migrations/20260724163957_catalog_seed.sql',
]
for (const file of required) {
  if (!fs.existsSync(path.join(root, file))) {
    console.error(`Missing Phase 4 file: ${file}`)
    process.exit(1)
  }
}

const syncSql = fs.readFileSync(path.join(root, 'supabase/migrations/20260724163946_catalog_sync.sql'), 'utf8')
const seedSql = fs.readFileSync(path.join(root, 'supabase/migrations/20260724163957_catalog_seed.sql'), 'utf8')
const bridge = fs.readFileSync(path.join(root, 'src/data/shared/catalogBridge.ts'), 'utf8')
const session = fs.readFileSync(path.join(root, 'src/data/shared/supabaseSession.ts'), 'utf8')

for (const requiredSql of [
  'catalog_sync_state',
  'catalog_product_code_tombstones',
  'get_catalog_admin_state',
  'replace_catalog_snapshot',
  'CATALOG_CONFLICT',
  'sort_order',
]) {
  if (!syncSql.includes(requiredSql)) {
    console.error(`Catalog sync migration missing: ${requiredSql}`)
    process.exit(1)
  }
}

if (!bridge.includes('refreshStorefrontCatalogFromRemote') || !bridge.includes('flushBusinessOsCatalogSync')) {
  console.error('Catalog bridge is missing Storefront read or Business OS write wiring.')
  process.exit(1)
}
if (!bridge.includes('local_fallback') || !bridge.includes('auth_required')) {
  console.error('Catalog bridge must retain safe fallback and staff-auth states.')
  process.exit(1)
}
if (/service[_-]?role|secret[_-]?key/i.test(session)) {
  console.error('Catalog session bridge must never embed a service-role or secret key.')
  process.exit(1)
}

let source = fs.readFileSync(path.join(root, 'src/store/catalogStoreSeedData.ts'), 'utf8')
source = source
  .replace(/^import type[^\n]*\n/, '')
  .replace('export const SEED_CATEGORIES: CatalogCategoryConfig[] =', 'const SEED_CATEGORIES =')
  .replace('export const SEED_PRODUCTS: CatalogProduct[] =', 'const SEED_PRODUCTS =')
source += '\nthis.__catalogSeed = { categories: SEED_CATEGORIES, products: SEED_PRODUCTS }\n'
const context = {}
vm.runInNewContext(source, context)
const data = context.__catalogSeed
const expectedProducts = data.products.length
const expectedVariants = data.products.reduce((sum, product) => sum + product.variants.length, 0)
const expectedOccasions = data.categories.length

const productInserts = (seedSql.match(/insert into public\.products \(/g) ?? []).length
const variantInserts = (seedSql.match(/insert into public\.product_variants \(/g) ?? []).length
const occasionInserts = (seedSql.match(/insert into public\.occasions \(/g) ?? []).length

if (productInserts !== expectedProducts || variantInserts !== expectedVariants || occasionInserts !== expectedOccasions) {
  console.error(`Catalog seed mismatch. Expected ${expectedOccasions}/${expectedProducts}/${expectedVariants}, got ${occasionInserts}/${productInserts}/${variantInserts}.`)
  process.exit(1)
}

console.log(`Catalog sync check passed: ${expectedOccasions} occasions, ${expectedProducts} products, ${expectedVariants} variants.`)
