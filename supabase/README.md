# Supabase directory

`migrations/20260724163939_shared_core.sql` is the canonical Phase 2 database migration for both Fleurstales builds.

Do not maintain divergent copies of the schema. This directory is the only
migration source used by both applications in the monorepo.

No production Supabase project credentials are stored here.

## Phase 4 Catalog connection

After the core migration, apply `20260724163946_catalog_sync.sql` and then `20260724163957_catalog_seed.sql`. See `docs/SUPABASE_PHASE4_CATALOG_CONNECTION.md` for runtime behavior and the authenticated OS write boundary.

## Phase 5 product images

`migrations/20260724164006_product_images.sql` extends `product_images` with MIME/size/dimension metadata and adds the revision-safe `replace_product_images_metadata` RPC used by the future Storage adapter. Product files remain in the public `product-images` bucket and mutations remain Owner/Admin-only.
## Phase 6 Store details

`migrations/20260724164007_store_sync.sql` adds the revision-safe public Store snapshot contract for profile, branches, opening hours, delivery fees, and customer-visible payment configuration. Private OS settings are excluded from the public projection.

## Phase 7 Customers / CRM

`migrations/20260724164009_customer_sync.sql` aligns TypeScript/Postgres WhatsApp identity normalization, adds customer revisions plus optimistic-concurrency Admin save/delete RPCs, and prepares Storefront checkout to preserve established CRM profiles while capturing missing fields as order-level suggestions. See `docs/SUPABASE_PHASE7_CUSTOMERS.md`.

## Later shared migrations

Apply the remaining migrations in filename order:

- `20260724164010_order_contract.sql`
- `20260724164011_auth_realtime_contract.sql`
- `20260724164012_size_guides.sql`
- `20260724164014_catalog_data_quality.sql`

Migration 010 repairs the reviewed mixed-Phalaenopsis starting price and
customer-facing name typos without changing any product or variant identity.

## V3 production security/concurrency hardening

`migrations/20260725203000_security_concurrency_hardening.sql` is the final
hardening layer for the live Supabase integration. It:

- splits the former all-in-one operational JSON into private, permission-scoped
  domains with revision-checked save RPCs;
- stores security audit events in a private append-only table;
- makes CRM read-only for Finance while keeping writes Owner/Admin-only;
- scopes Orders reads by role/branch/Florist assignment and revokes direct
  browser writes to authoritative order tables;
- routes Business OS order mutations through one revision-checked RPC that
  validates workflow locks, change requests, Finance decisions, refunds, line
  items, and append-only payment history atomically;
- repairs Size Guide role literals to lowercase; and
- provisions the first Owner from trusted Auth `raw_app_meta_data` rather than
  a personal email embedded in migrations.

### First Owner provisioning

Create the Auth user normally, then use a trusted Supabase admin/service
context to set these app-metadata values on that user:

```json
{
  "fleurstales_role": "owner",
  "fleurstales_display_name": "Fleurstales Owner"
}
```

Do not put admin/service credentials in either browser application. The trigger
creates the first active `staff_access_profiles` Owner from this trusted
metadata. Subsequent staff access should be managed through the normal
Owner-controlled staff workflow.

### Security checks

The repository-level static contract check is:

```sh
npm run check:supabase-security
```

After applying all migrations to a real Supabase/Postgres database, also run:

```text
supabase/tests/security_authorization_smoke.sql
```

That SQL smoke test verifies the hardened RPCs/policies and confirms that the
`authenticated` role no longer has direct write privileges on authoritative
Orders or the private audit trail.

## V3.3 staff/session foundation

`migrations/20260725223000_staff_settings_runtime_authority.sql` completes the
production employee/session foundation on top of V3.2:

- Owner-managed staff-role, attendance, scheduling, payroll settings and their
  revision histories are durable Supabase state;
- safe role families bound configurable capabilities so Settings cannot grant a
  capability across unrelated authority domains;
- `staff_runtime_context` stores schedule/default/override branch per Auth session,
  so each signed-in device has its own RLS-visible operational branch;
- staff access-profile role/status/name changes are synchronized through an
  authenticated RPC;
- final Payroll payment accepts exactly one newly-paid proposal per command.

New non-Owner Auth accounts are created by `functions/staff-admin`, never by a
browser-held secret. The function verifies the signed-in staff user against the
database permission model, creates the Supabase Auth user with a strong staff password,
and links the Auth user and OS username to `staff_access_profiles`. The public
`staff-login` function resolves username + password to a normal Supabase
session while keeping the internal Auth email private.

After applying all migrations, also run:

```text
supabase/tests/v33_staff_settings_runtime_smoke.sql
```

## V3.5 backend wiring completion

Migration `20260725230000_backend_wiring_completion.sql` completes the remaining prototype-to-production paths:

- authoritative Storefront checkout quotes and voucher application;
- authenticated WhatsApp/walk-in Order creation;
- atomic Order payment/refund projection into Finance;
- normalized staff schedules and self-attendance APIs;
- server-generated Order contribution points;
- CRM Realtime publication;
- server-backed customer-segmentation settings.

After applying migrations in staging, run `tests/v35_backend_wiring_smoke.sql` in addition to the earlier security smoke tests. Verify the Storefront and Business OS with separate Owner, Admin, Finance, HR, and Florist sessions before deploying production data.

## V3.6 integrity/concurrency completion

Migration `20260725233000_integrity_concurrency_completion.sql` serializes Storefront and internal-Order idempotency keys, binds each key to a request hash, makes attendance geography/status server-derived, projects Order payment/refund activity into Finance in the same transaction, and normalizes Order contribution-point events. Run `tests/v36_integrity_concurrency_smoke.sql` after migration.

## V3.7 authority consistency

Migration `20260725234500_authority_consistency_completion.sql` aligns the remaining Business OS rules with the authoritative backend:

- Admin Order mutations honor the per-session runtime branch through the complete validator chain;
- internal Order review uses `quote_internal_order` before confirmation;
- CRM/VIP metrics use the same verified-business rules as voucher pricing;
- accepted internal-Order customer mutations advance CRM revisions;
- Florist access remains assigned-work read-only and cannot mutate Order status;
- normalized employee points are changed through dedicated command RPCs;
- Finance verification/rejection actors are server-stamped; and
- attendance selfies live in the private `attendance-selfies` Storage bucket.

Run `tests/v37_authority_consistency_smoke.sql` after all earlier smoke tests. The production workflow also runs `supabase db lint --linked --schema public --level error --fail-on error` and every Fleurstales smoke SQL before web deployment. It therefore requires the GitHub Actions secret `SUPABASE_DB_URL` for a trusted direct Postgres connection used only inside the migration job.


## V3.8 Florist Order read-only

Migration `20260725235500_florist_order_read_only.sql` removes Florist from the
`orders.advance_status` capability family, disables any previously persisted
Florist status permission, and places a final authenticated role boundary in
front of the Order writer. Florists retain assigned-Order read access only.
Run `tests/v38_florist_order_read_only_smoke.sql` after all earlier tests.


### V3.11 staff authentication

Production Supabase staff accounts use strong passwords: at least 12 characters with lowercase, uppercase, a number, and a symbol. Local/demo OS mode may still use the six-digit `123456` PIN and does not copy that PIN into Supabase Auth. The `staff-login` Edge Function enforces username/IP throttling through service-only RPCs and returns generic failures to avoid account enumeration.

Hosted Supabase Auth settings must mirror `supabase/config.toml` before production staff accounts are enabled. Existing hosted accounts that used a six-digit credential must be reset to a strong password.
