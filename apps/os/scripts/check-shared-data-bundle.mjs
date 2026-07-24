import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const root = process.cwd()
const requiredFiles = [
  'src/data/shared/catalogLocalAdapter.ts',
  'src/data/shared/sharedDataBundleTypes.ts',
  'src/data/shared/sharedDataBundleDomain.ts',
  'src/data/shared/sharedDataBundle.ts',
  'src/data/shared/sharedDataBundleIo.ts',
  'src/data/shared/sharedDataMigration.ts',
  'src/data/shared/sharedDataSimulation.ts',
  'shared-data/fixtures/shared-data-bundle-v1.json',
  'scripts/shared-data-bundle-cli.mjs',
  'docs/SUPABASE_PHASE10_SHARED_DATA_QA.md',
]
for (const file of requiredFiles) {
  if (!fs.existsSync(path.join(root, file))) throw new Error(`Missing Phase 10 file: ${file}`)
}

const bundleSource = fs.readFileSync(path.join(root, 'src/data/shared/sharedDataBundle.ts'), 'utf8')
const bundleTypesSource = fs.readFileSync(path.join(root, 'src/data/shared/sharedDataBundleTypes.ts'), 'utf8')
const bundleDomainSource = fs.readFileSync(path.join(root, 'src/data/shared/sharedDataBundleDomain.ts'), 'utf8')
for (const token of ['buildSharedDataBundleFromLocalStores', 'applySharedDataBundleToLocalStores']) {
  if (!bundleSource.includes(token)) throw new Error(`Phase 10 bundle runtime is missing: ${token}`)
}
for (const token of ["SHARED_DATA_BUNDLE_KIND = 'fleurstales.shared-data'", 'SHARED_DATA_BUNDLE_VERSION = 1']) {
  if (!bundleTypesSource.includes(token)) throw new Error(`Phase 10 bundle schema is missing: ${token}`)
}
for (const token of ['validateSharedDataBundle', 'fingerprintSharedDataBundle']) {
  if (!bundleDomainSource.includes(token)) throw new Error(`Phase 10 bundle domain is missing: ${token}`)
}

const migrationSource = fs.readFileSync(path.join(root, 'src/data/shared/sharedDataMigration.ts'), 'utf8')
for (const table of ['catalog_sync_state', 'catalog_product_code_tombstones', 'store_sync_state', 'order_sequences', 'products', 'product_variants', 'customers', 'orders', 'order_items', 'branches']) {
  if (!migrationSource.includes(`${table}:`)) throw new Error(`Migration plan does not include ${table}`)
}

const simulationSource = fs.readFileSync(path.join(root, 'src/data/shared/sharedDataSimulation.ts'), 'utf8')
for (const token of ['createSharedDataSimulation', 'CATALOG_CONFLICT', 'STORE_CONFLICT', 'CUSTOMER_CONFLICT']) {
  if (!simulationSource.includes(token)) throw new Error(`Local simulation is missing ${token}`)
}

const fixture = path.join(root, 'shared-data/fixtures/shared-data-bundle-v1.json')
const result = spawnSync(process.execPath, [path.join(root, 'scripts/shared-data-bundle-cli.mjs'), 'validate', fixture], { encoding: 'utf8' })
if (result.status !== 0) throw new Error(result.stderr || result.stdout || 'Fixture validation failed')

console.log('Phase 10 shared-data bundle check PASS')
console.log(result.stdout.trim())
