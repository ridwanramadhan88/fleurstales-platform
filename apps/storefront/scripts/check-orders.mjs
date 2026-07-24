import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { execFileSync } from 'node:child_process'

const root = process.cwd()
const required = [
  'src/data/shared/orderDomain.ts',
  'src/data/shared/orderLocalAdapter.ts',
  'src/types/orders.ts',
  'src/store/ordersStore.ts',
  'supabase/migrations/20260724164010_order_contract.sql',
  'docs/SUPABASE_PHASE8_ORDERS.md',
]
for (const relative of required) {
  if (!fs.existsSync(path.join(root, relative))) throw new Error(`Missing Phase 8 file: ${relative}`)
}

const types = fs.readFileSync(path.join(root, 'src/types/orders.ts'), 'utf8')
for (const token of ['productCodeSnapshot?: string', 'productNameSnapshot?: string', 'variantSkuSnapshot?: string', 'variantSizeSnapshot?: string', 'storefrontIdempotencyKey?: string', 'createdAt?: string']) {
  if (!types.includes(token)) throw new Error(`Order type missing: ${token}`)
}

const domain = fs.readFileSync(path.join(root, 'src/data/shared/orderDomain.ts'), 'utf8')
for (const token of ['resolveStorefrontOrderPricing', "item.status === 'active'", 'branch.deliveryFeeIdr', 'trustedDiscountIdr', 'productCodeSnapshot', 'variantSkuSnapshot']) {
  if (!domain.includes(token)) throw new Error(`Order pricing domain missing: ${token}`)
}
if (domain.includes('line.unitPriceIdr')) throw new Error('Canonical pricing must not trust a cart line unit price.')

const orderStore = fs.readFileSync(path.join(root, 'src/store/ordersStore.ts'), 'utf8')
for (const token of ['storefrontIdempotencyKey === storefrontKey', 'currentYearSequence', "timeZone: 'Asia/Jakarta'", 'createdAt: now.toISOString()', 'storefrontIdempotencyKey: storefrontKey']) {
  if (!orderStore.includes(token)) throw new Error(`Order store parity behavior missing: ${token}`)
}

const checkout = fs.readFileSync(path.join(root, 'src/components/storefront/CartDrawerController.ts'), 'utf8')
for (const token of ['resolveStorefrontOrderPricing', 'resolvedPricingToOrderLineItems', 'checkoutIdempotencyKey', 'line.variantId', 'totalIdr: resolved.totalIdr']) {
  if (!checkout.includes(token)) throw new Error(`Storefront canonical checkout missing: ${token}`)
}
const pricingValidationIndex = checkout.indexOf('resolved = resolveStorefrontOrderPricing({')
const customerIntakeIndex = checkout.indexOf('const intake = createOrUpdateCustomerFromStorefront({')
const orderCreateIndex = checkout.indexOf('const order = createOrder({')
if (pricingValidationIndex < 0 || customerIntakeIndex < pricingValidationIndex || orderCreateIndex < customerIntakeIndex) {
  throw new Error('Storefront checkout must validate authoritative catalog pricing before CRM intake, then create the Order.')
}

const cart = fs.readFileSync(path.join(root, 'src/components/storefront/CartDrawer.tsx'), 'utf8')
if (!cart.includes('variantId?: string')) throw new Error('Cart lines must preserve the selected variant id.')

const repositories = fs.readFileSync(path.join(root, 'src/data/shared/repositories.ts'), 'utf8')
for (const token of ['createOrdersAdminRepository', "select: '*,order_items(*)'", 'product_name_snapshot', 'p_promo_code']) {
  if (!repositories.includes(token)) throw new Error(`Order repository missing: ${token}`)
}
const bootstrap = fs.readFileSync(path.join(root, 'src/data/shared/bootstrap.ts'), 'utf8')
if (!bootstrap.includes('ordersAdmin: createOrdersAdminRepository(client)')) throw new Error('Orders repository is not exposed through shared bootstrap.')

const sql = fs.readFileSync(path.join(root, 'supabase/migrations/20260724164010_order_contract.sql'), 'utf8')
for (const token of ['private.allocate_order_number', 'p_promo_code text default null', 'v_variant.price_idr', 'storefront_idempotency_key', 'order_items_quantity_max_99', 'orders_discount_not_above_subtotal']) {
  if (!sql.includes(token)) throw new Error(`Phase 8 SQL missing: ${token}`)
}
if (/p_(unit_price|items_subtotal|delivery_fee|discount|total)/i.test(sql)) {
  throw new Error('Anonymous checkout RPC must not accept authoritative monetary totals from the client.')
}
const sqlPricingIndex = sql.indexOf('-- Validate catalog/pricing before touching CRM')
const sqlCustomerIndex = sql.indexOf('-- Create a new CRM profile atomically')
if (sqlPricingIndex < 0 || sqlCustomerIndex < sqlPricingIndex) {
  throw new Error('Prepared checkout RPC must validate authoritative Catalog pricing before CRM mutation.')
}


const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'fleur-phase8-'))
try {
  execFileSync('tsc', [
    path.join(root, 'src/data/shared/orderDomain.ts'),
    path.join(root, 'src/data/shared/orderLocalAdapter.ts'),
    path.join(root, 'src/data/shared/contracts.ts'),
    path.join(root, 'src/data/shared/databaseTypes.ts'),
    '--target', 'ES2020', '--module', 'commonjs', '--outDir', temp,
    '--skipLibCheck', '--noCheck', '--esModuleInterop',
  ], { stdio: 'pipe' })
  const domainJs = path.join(temp, 'data/shared/orderDomain.js')
  const adapterJs = path.join(temp, 'data/shared/orderLocalAdapter.js')
  const smoke = `
    const d=require(${JSON.stringify(domainJs)}); const a=require(${JSON.stringify(adapterJs)});
    const day={isOpen:true,opensAt:'07:00',closesAt:'19:00'};
    const branch={id:'Kedamaian',name:'Kedamaian',code:'KDM',address:'',phone:'',isActive:true,deliveryFeeIdr:15000,openingHours:{monday:day,tuesday:day,wednesday:day,thursday:day,friday:day,saturday:day,sunday:day}};
    const product={id:'prod-1',productId:'BDY-000001',category:'Birthday',material:'fresh',name:'Rose Bouquet',variants:[{id:'var-1',sku:'BDY-FRE-001',size:'M',price:250000,status:'active'}],isActive:true};
    const request={idempotencyKey:'checkout-attempt-123456789',customer:{name:'A',whatsappNumber:'08123456789'},branchId:'Kedamaian',fulfillment:'delivery',scheduleDate:'2026-07-25',scheduleTime:'10:00',items:[{productId:'prod-1',variantId:'var-1',quantity:2}],deliveryAddress:'Jl. Test',paymentMethod:'transfer'};
    const r=d.resolveStorefrontOrderPricing({request,products:[product],branches:[branch],trustedDiscountIdr:50000,now:new Date('2026-07-24T00:00:00Z')});
    if(r.itemsSubtotalIdr!==500000||r.deliveryFeeIdr!==15000||r.discountIdr!==50000||r.totalIdr!==465000) throw new Error(JSON.stringify(r));
    if(r.items[0].productCodeSnapshot!=='BDY-000001'||r.items[0].variantSkuSnapshot!=='BDY-FRE-001') throw new Error('snapshots');
    const lines=a.resolvedPricingToOrderLineItems(r,()=> 'line-1');
    if(lines[0].variantId!=='var-1'||lines[0].unitPriceIdr!==250000) throw new Error('line mapping');
  `
  execFileSync(process.execPath, ['-e', smoke], { stdio: 'pipe' })
} finally {
  fs.rmSync(temp, { recursive: true, force: true })
}

console.log('Phase 8 order contract checks passed.')
