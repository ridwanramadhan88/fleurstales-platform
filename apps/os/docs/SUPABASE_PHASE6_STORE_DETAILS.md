# Phase 6 — Shared Store Details

Phase 6 makes Business OS and Storefront use one public Store data contract without requiring a live Supabase project.

## Shared public projection

- Store name / legal name
- Public logo URL
- Phone / WhatsApp / email / address
- Currency and timezone
- Branch name, code, public address/phone
- Branch active state and display order
- Delivery fee
- Weekly opening hours
- Public branch coordinates
- Customer-visible payment accounts
- Storefront payment instructions

The following remain OS-only and are deliberately excluded from this projection:

- Inventory enablement
- Staff / roles / permissions
- Payroll / attendance / scheduling
- Branch manager employee assignment
- Daily operational order limits

## Local-first adapter

`src/data/shared/storeLocalAdapter.ts` implements the same `StoreAdminRepository` contract as the future Supabase adapter. This lets both builds exercise identical mapping and validation while local persistence is still authoritative.

## Startup behavior

Storefront:
1. Hydrates operational persistence.
2. Normalizes the local Store snapshot.
3. If Supabase is configured, tries to read the public Store snapshot before first render.
4. Falls back to local data when remote data is unavailable or empty.

Business OS:
1. Hydrates operational persistence.
2. Normalizes the local Store snapshot.
3. Remote replacement/writes require a valid Supabase Owner token.
4. Once authenticated, public Store edits are debounced into one revision-protected snapshot transaction.

## Future RPC

`replace_public_store_snapshot(...)` atomically updates Store profile, branches, public payment accounts and payment instructions. A `store_sync_state.revision` prevents two Owner sessions from silently overwriting each other.

Branches omitted by a later snapshot are deactivated rather than deleted, preserving historical references.
