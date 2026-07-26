import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const required = [
  'src/data/shared/storeSettingsDomain.ts',
  'src/data/shared/storeLocalAdapter.ts',
  'src/data/shared/storeBridge.ts',
  'supabase/migrations/20260724164007_store_sync.sql',
  'docs/SUPABASE_PHASE6_STORE_DETAILS.md',
]
for (const relative of required) {
  if (!fs.existsSync(path.join(root, relative))) throw new Error(`Missing Phase 6 file: ${relative}`)
}

const contracts = fs.readFileSync(path.join(root, 'src/data/shared/contracts.ts'), 'utf8')
for (const token of ['SharedStoreSnapshot', 'SharedStoreAdminState', 'SharedStoreReplaceResult', 'sortOrder: number']) {
  if (!contracts.includes(token)) throw new Error(`Missing shared Store contract token: ${token}`)
}

const bridge = fs.readFileSync(path.join(root, 'src/data/shared/storeBridge.ts'), 'utf8')
for (const token of ['initializeStorefrontStoreBridge', 'initializeBusinessOsStoreBridge', 'flushBusinessOsStoreSync', 'STORE_CONFLICT']) {
  if (!bridge.includes(token)) throw new Error(`Missing Store bridge behavior: ${token}`)
}

const sql = fs.readFileSync(path.join(root, 'supabase/migrations/20260724164007_store_sync.sql'), 'utf8')
for (const token of ['store_sync_state', 'get_store_admin_state', 'replace_public_store_snapshot', 'sort_order']) {
  if (!sql.includes(token)) throw new Error(`Missing Store migration behavior: ${token}`)
}

const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
const isStorefront = packageJson.name === 'fleurstales-storefront'
const isBusinessOs = packageJson.name === 'fleurstales-os'
if (!isStorefront && !isBusinessOs) throw new Error(`Unknown Fleurstales package: ${packageJson.name ?? 'unnamed'}`)

const startupFile = path.join(root, 'src/main.tsx')
const startup = fs.readFileSync(startupFile, 'utf8')
const expectedInitializer = isStorefront ? 'initializeStorefrontStoreBridge' : 'initializeBusinessOsStoreBridge'
if (!startup.includes(expectedInitializer)) throw new Error(`Store bridge is not wired at startup: ${expectedInitializer}`)

if (isBusinessOs) {
  const app = fs.readFileSync(path.join(root, 'src/App.tsx'), 'utf8')
  if (!app.includes('refreshBusinessOsStoreFromRemote()')) {
    throw new Error('Every signed-in OS role must hydrate safe remote Store/branch data.')
  }
  if (!bridge.includes("const writable = useUserStore.getState().role === 'owner'")) {
    throw new Error('Only Owner may hydrate the writable Store administration projection.')
  }
  if (!app.includes('stopBusinessOsStoreBridge()')) throw new Error('Business OS sign-out must stop the Store bridge.')
}

console.log('Phase 6 shared Store synchronization checks passed.')
