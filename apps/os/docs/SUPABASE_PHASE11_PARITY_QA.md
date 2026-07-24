# Phase 11 — Cross-build shared-data parity QA

Phase 11 proves the Business Operational System and Online Store can process the same four shared domains identically **before** a live Supabase project exists.

## What is exercised

The deterministic scenario starts from `shared-data/fixtures/shared-data-bundle-v1.json` and checks:

1. Public Catalog reads hide product costs while authenticated/admin reads retain them.
2. Storefront-visible branches, payment accounts, and delivery fees come from the shared Store snapshot.
3. WhatsApp variants resolve to one CRM identity.
4. Storefront checkout creates Orders that are immediately readable through the Business OS Order repository.
5. Existing CRM profile fields are preserved; missing email/birthday values become Order suggestions instead of silent CRM writes.
6. Order snapshots preserve submitted customer context and product/variant price context.
7. Checkout idempotency returns the same Order on retry.
8. Catalog price and branch delivery-fee changes are re-read authoritatively on the next checkout.
9. Order numbering continues branch/year sequence using Asia/Jakarta year semantics.
10. The resulting portable shared bundle remains valid and produces a deterministic final fingerprint.

## Locked deterministic result

- Initial fingerprint: `fnv1a32:76d1b32d`
- First new Order: `KDM-2026-0002`
- Idempotent delivery Order: `KDM-2026-0003`
- After authoritative price/fee mutation: `KDM-2026-0004`
- Updated unit price: Rp375,000
- Updated delivery fee: Rp30,000
- Updated total: Rp405,000
- Final fingerprint: `fnv1a32:3daa96ef`

Run:

```bash
npm run check:parity
```

The checker compiles only the dependency-free shared-data modules, so it can run even when the clean build has no `node_modules`, provided a TypeScript compiler is available on the machine.

## Important boundary

This verifies the **shared data/process contract**, not pixel-identical UI. The OS and Online Store intentionally render different interfaces, but their Catalog, Store, Customer/CRM, and Order semantics must remain identical.

Actual Supabase Auth, RLS, Storage, PostgreSQL transactions, and Realtime transport remain deferred until a real Supabase project is connected.
