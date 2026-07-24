import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const shared = path.join(root, 'src/data/shared')
const required = [
  'bootstrap.ts',
  'catalogBridge.ts',
  'catalogImageBridge.ts',
  'contracts.ts',
  'databaseTypes.ts',
  'index.ts',
  'repositories.ts',
  'repositoryContracts.ts',
  'supabaseConfig.ts',
  'supabaseHttpClient.ts',
  'supabaseSession.ts',
  'storeSettingsDomain.ts',
  'storeLocalAdapter.ts',
  'storeBridge.ts',
]

const missing = required.filter((file) => !fs.existsSync(path.join(shared, file)))
if (missing.length) {
  console.error(`Missing shared-data files: ${missing.join(', ')}`)
  process.exit(1)
}

const database = fs.readFileSync(path.join(shared, 'databaseTypes.ts'), 'utf8')
const migration = fs.readFileSync(path.join(root, 'supabase/migrations/20260724163939_shared_core.sql'), 'utf8')
const tables = [...migration.matchAll(/create table if not exists public\.([a-z_]+)/g)].map((match) => match[1])
const absentTypes = tables.filter((table) => !new RegExp(`\\b${table}: TableDefinition<`).test(database))
if (absentTypes.length) {
  console.error(`Database type contract is missing Phase 2 tables: ${absentTypes.join(', ')}`)
  process.exit(1)
}

const combined = required.map((file) => fs.readFileSync(path.join(shared, file), 'utf8')).join('\n')
if (/VITE_SUPABASE_(?:SERVICE|SECRET)/i.test(combined)) {
  console.error('Frontend shared-data layer must never read a Supabase secret/service key.')
  process.exit(1)
}
if (!combined.includes('create_storefront_order')) {
  console.error('Storefront checkout RPC is missing from the shared contract.')
  process.exit(1)
}

const httpClient = fs.readFileSync(path.join(shared, 'supabaseHttpClient.ts'), 'utf8')
if (httpClient.includes('accessToken || this.config.publishableKey')) {
  console.error('Publishable API keys must not be used as a fallback Bearer token.')
  process.exit(1)
}
if (!httpClient.includes("if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`)")) {
  console.error('Authenticated Supabase calls must send the user session JWT as the Bearer token.')
  process.exit(1)
}

console.log(`Shared-data contract check passed: ${tables.length} Phase 2 tables represented.`)
