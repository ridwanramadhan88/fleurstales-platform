# Phase 8 — Orders contract preparation

Phase 8 makes the current local Storefront/Business OS order path behave like the future Supabase path without requiring a live project.

## Canonical Storefront request

The Storefront now identifies every line by `productId + variantId + quantity`. Cart display names and prices are previews only. At confirmation, `resolveStorefrontOrderPricing` re-reads the active Catalog variant and active Branch to derive:

- immutable Product ID/code, product name, SKU, and size snapshots;
- authoritative unit prices and items subtotal;
- branch delivery fee;
- total after an already-validated internal voucher discount.

Anonymous Supabase checkout will never accept unit prices, delivery fee, subtotal, discount, or grand total from the browser.
Catalog/variant validation is completed before CRM mutation in both the local preparation flow and the future transactional RPC.

## Customer/order history boundary

CRM identity remains linked by `customerId`, while every Order keeps its own immutable contact snapshot. Product/variant snapshots follow the same rule: later Catalog edits never rewrite historical Orders.

## Idempotency and order numbering

Each Storefront checkout attempt has one stable idempotency key. Local order creation returns the existing order when that key is retried. The prepared database RPC uses the unique `storefront_idempotency_key` in the same way.

Order numbers are scoped to branch code + Jakarta calendar year. The local allocator now derives the current-year sequence from existing order numbers. The database uses `order_sequences(branch_id, sequence_year)` through `private.allocate_order_number`.

## Voucher boundary

Vouchers are not one of the four requested shared domains. The current local Storefront continues to apply discounts only after the existing voucher domain validates them. The future anonymous RPC stores `promo_code` as an order-time snapshot but accepts **no discount amount from the browser**. A live switch must therefore either add vouchers to backend scope or intentionally disable public voucher discounts until they are backend-authoritative.

## Prepared repository

`ordersAdmin` can read canonical Orders with nested `order_items`. Storefront checkout remains a restricted RPC-only write path. Live order workflow mutations remain deferred until a Supabase staff session/backend is attached.
