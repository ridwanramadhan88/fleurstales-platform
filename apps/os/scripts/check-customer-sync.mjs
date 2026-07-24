import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import os from 'node:os'

const root = process.cwd()
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
const isStorefront = packageJson.name === 'fleurstales-storefront'
const required = [
  'src/data/shared/customerIdentityDomain.ts',
  'src/data/shared/customerLocalAdapter.ts',
  'src/domain/customerIntakeDomain.ts',
  'supabase/migrations/20260724164009_customer_sync.sql',
  'docs/SUPABASE_PHASE7_CUSTOMERS.md',
]
for (const relative of required) {
  if (!fs.existsSync(path.join(root, relative))) throw new Error(`Missing Phase 7 file: ${relative}`)
}

const identity = fs.readFileSync(path.join(root, 'src/data/shared/customerIdentityDomain.ts'), 'utf8')
for (const token of [
  'normalizeCustomerWhatsappNumber',
  "digits.startsWith('0062')",
  "digits.startsWith('620')",
  "digits.startsWith('0')",
  "digits.startsWith('8')",
  'getCanonicalCustomerSuggestions',
  'buildCanonicalOrderCustomerSnapshot',
]) {
  if (!identity.includes(token)) throw new Error(`Missing canonical customer identity behavior: ${token}`)
}

const store = fs.readFileSync(path.join(root, 'src/store/customerStore.ts'), 'utf8')
for (const token of ['CUSTOMERS_PERSIST_VERSION = 4', 'assertCustomerWhatsappAvailable', 'normalizePersistedCustomers']) {
  if (!store.includes(token)) throw new Error(`Missing CRM-store behavior: ${token}`)
}

if (isStorefront) {
  const checkout = fs.readFileSync(path.join(root, 'src/components/storefront/CartDrawerController.ts'), 'utf8')
  if (!checkout.includes('buildOrderCustomerSnapshot(savedCustomer')) {
    throw new Error('Storefront checkout must use the canonical historical customer snapshot builder.')
  }
}

const contracts = fs.readFileSync(path.join(root, 'src/data/shared/contracts.ts'), 'utf8')
for (const token of ['SharedCustomerIntakeInput', 'SharedCustomerIntakeResult', 'revision: number']) {
  if (!contracts.includes(token)) throw new Error(`Missing Phase 7 shared contract: ${token}`)
}

const repos = fs.readFileSync(path.join(root, 'src/data/shared/repositories.ts'), 'utf8')
for (const token of ['createCustomerAdminRepository', 'findCustomerByWhatsapp', 'save_customer_profile', 'delete_customer_profile']) {
  if (!repos.includes(token)) throw new Error(`Missing Customer repository behavior: ${token}`)
}

const sql = fs.readFileSync(path.join(root, 'supabase/migrations/20260724164009_customer_sync.sql'), 'utf8')
for (const token of [
  'customers_normalized_whatsapp_matches',
  'save_customer_profile',
  'delete_customer_profile',
  'CUSTOMER_CONFLICT',
  'on conflict (normalized_whatsapp_number) do nothing',
  'v_customer_suggestions',
]) {
  if (!sql.includes(token)) throw new Error(`Missing Phase 7 migration behavior: ${token}`)
}
if (/for select to anon[\s\S]{0,120}public\.customers/i.test(sql)) {
  throw new Error('Phase 7 must not grant anonymous direct CRM reads.')
}

// Compile/run the dependency-free identity domain for a real behavior smoke test.
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'fleur-phase7-'))
try {
  execFileSync('tsc', [
    path.join(root, 'src/data/shared/customerIdentityDomain.ts'),
    '--target', 'ES2020', '--module', 'commonjs', '--outDir', temp, '--strict', '--skipLibCheck',
  ], { stdio: 'pipe' })
  const js = path.join(temp, 'customerIdentityDomain.js')
  const smoke = `
    const d=require(${JSON.stringify(js)});
    const values=['0812 3456 7890','+62 812-3456-7890','6281234567890','81234567890','0062 812 3456 7890','62081234567890'];
    for (const value of values) if (d.normalizeCustomerWhatsappNumber(value)!=='6281234567890') throw new Error(value);
    const existing={id:'c',name:'CRM',whatsappNumber:'081234567890',normalizedWhatsappNumber:'6281234567890',email:'keep@example.com',preferredBranchId:'Pahoman'};
    const suggestions=d.getCanonicalCustomerSuggestions(existing,{email:'new@example.com',birthday:'1990-05-12',preferredBranchId:'Kedamaian'});
    if (JSON.stringify(suggestions)!==JSON.stringify({birthday:'1990-05-12'})) throw new Error(JSON.stringify(suggestions));
  `
  execFileSync(process.execPath, ['-e', smoke], { stdio: 'pipe' })
} finally {
  fs.rmSync(temp, { recursive: true, force: true })
}

console.log('Phase 7 customer / CRM synchronization checks passed.')
