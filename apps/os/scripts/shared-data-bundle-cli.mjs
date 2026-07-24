#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'

const KIND = 'fleurstales.shared-data'
const VERSION = 1

const stableStringify = (value) => {
  const visit = (input) => {
    if (Array.isArray(input)) return input.map(visit)
    if (!input || typeof input !== 'object') return input
    return Object.fromEntries(Object.entries(input)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => [key, visit(item)]))
  }
  return JSON.stringify(visit(value))
}

const fingerprint = (bundle) => {
  const canonical = stableStringify({ catalog: bundle.catalog, store: bundle.store, customers: bundle.customers, orders: bundle.orders })
  let hash = 0x811c9dc5
  for (let index = 0; index < canonical.length; index += 1) {
    hash ^= canonical.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return `fnv1a32:${(hash >>> 0).toString(16).padStart(8, '0')}`
}

const readEnvelope = (filename) => {
  const absolute = path.resolve(filename)
  const parsed = JSON.parse(fs.readFileSync(absolute, 'utf8'))
  if (parsed?.format !== KIND || parsed?.version !== VERSION || !parsed?.data) {
    throw new Error(`${filename}: unsupported shared-data envelope`)
  }
  if (parsed.data.kind !== KIND || parsed.data.version !== VERSION) {
    throw new Error(`${filename}: bundle kind/version mismatch`)
  }
  const actual = fingerprint(parsed.data)
  if (parsed.fingerprint !== actual) {
    throw new Error(`${filename}: fingerprint mismatch (expected ${parsed.fingerprint}, actual ${actual})`)
  }
  return { absolute, envelope: parsed, bundle: parsed.data, fingerprint: actual }
}

const validateShape = (bundle) => {
  const requiredArrays = [
    ['catalog.occasions', bundle?.catalog?.occasions],
    ['catalog.products', bundle?.catalog?.products],
    ['store.snapshot.branches', bundle?.store?.snapshot?.branches],
    ['store.snapshot.paymentAccounts', bundle?.store?.snapshot?.paymentAccounts],
    ['customers.customers', bundle?.customers?.customers],
    ['customers.addresses', bundle?.customers?.addresses],
    ['orders.orders', bundle?.orders?.orders],
  ]
  for (const [label, value] of requiredArrays) {
    if (!Array.isArray(value)) throw new Error(`Missing ${label} array`)
  }
  const unique = (values, label) => {
    if (new Set(values).size !== values.length) throw new Error(`Duplicate ${label}`)
  }
  unique(bundle.catalog.products.map((row) => row.id), 'product IDs')
  unique(bundle.catalog.products.map((row) => row.productCode), 'product codes')
  unique(bundle.catalog.products.flatMap((row) => row.variants.map((variant) => variant.sku)), 'SKUs')
  unique(bundle.customers.customers.map((row) => row.normalizedWhatsappNumber), 'customer WhatsApp identities')
  unique(bundle.orders.orders.map((row) => row.orderNumber), 'order numbers')
  return true
}

const summary = (bundle) => ({
  occasions: bundle.catalog.occasions.length,
  products: bundle.catalog.products.length,
  variants: bundle.catalog.products.reduce((sum, product) => sum + product.variants.length, 0),
  images: bundle.catalog.products.reduce((sum, product) => sum + product.images.length, 0),
  branches: bundle.store.snapshot.branches.length,
  paymentAccounts: bundle.store.snapshot.paymentAccounts.length,
  customers: bundle.customers.customers.length,
  customerAddresses: bundle.customers.addresses.length,
  orders: bundle.orders.orders.length,
  orderItems: bundle.orders.orders.reduce((sum, order) => sum + order.items.length, 0),
})

const [command, ...args] = process.argv.slice(2)
try {
  if (!command || command === 'help') {
    console.log('Usage: node scripts/shared-data-bundle-cli.mjs <validate|summary|compare> <file> [other-file]')
    process.exit(0)
  }
  if (command === 'validate') {
    if (!args[0]) throw new Error('validate requires a bundle JSON file')
    const { bundle, fingerprint: hash } = readEnvelope(args[0])
    validateShape(bundle)
    console.log(`PASS ${args[0]} ${hash}`)
    console.log(JSON.stringify(summary(bundle), null, 2))
  } else if (command === 'summary') {
    if (!args[0]) throw new Error('summary requires a bundle JSON file')
    const { bundle, fingerprint: hash } = readEnvelope(args[0])
    validateShape(bundle)
    console.log(JSON.stringify({ fingerprint: hash, ...summary(bundle) }, null, 2))
  } else if (command === 'compare') {
    if (!args[0] || !args[1]) throw new Error('compare requires two bundle JSON files')
    const left = readEnvelope(args[0])
    const right = readEnvelope(args[1])
    validateShape(left.bundle)
    validateShape(right.bundle)
    if (left.fingerprint !== right.fingerprint) {
      console.error(`DIFFERENT\n${args[0]} ${left.fingerprint}\n${args[1]} ${right.fingerprint}`)
      process.exit(2)
    }
    console.log(`IDENTICAL ${left.fingerprint}`)
  } else {
    throw new Error(`Unknown command: ${command}`)
  }
} catch (error) {
  console.error(`FAIL ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
}
