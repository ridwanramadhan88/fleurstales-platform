# Batch 3 — Product Variant Production Hardening

Batch 3 starts after the Batch 1 + Batch 2 variant rollout reached `main`.

The goal is to make `ProductVariant` the trusted source of truth for variant-enabled products without breaking legacy products or historical orders.

## Phase 1 — audit before cleanup

- Add a deterministic catalog integrity audit for:
  - missing `sizeOptionId`
  - duplicate product + size-option mappings
  - missing or orphaned template assignments
  - active variants pointing at archived sizes
  - invalid variant prices
  - active variants still relying on base image/recipe fallbacks
- Treat legacy compatibility gaps as warnings first; do not delete or rewrite production data automatically.

## Phase 2 — production hardening

- Verify variant identity from Storefront → Cart → Checkout → Order Detail → Production.
- Keep server-authoritative variant pricing and recipe resolution.
- Harden post-checkout variant changes so variant id, purchase price, recipe snapshot, image snapshot and totals update atomically.
- Add regression coverage for unavailable/archived variants, Small + Medium in one cart, template remapping and historical-order stability.

## Phase 3 — guarded cleanup

Only after production data is audited and migrated:

- stop using free-text size as identity
- stop using product-level price/image/recipe fallbacks for migrated variant-enabled products
- remove deprecated compatibility paths in small reviewed steps
- keep legacy/non-variant products supported until their migration is explicitly complete

## Release rule

No destructive legacy-column removal is allowed at the start of Batch 3. Cleanup follows verified production data and passing end-to-end checks.
