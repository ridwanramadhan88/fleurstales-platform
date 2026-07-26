# Fleurstales Platform

One repository for the customer Storefront, staff Business OS, and their shared
Supabase database contract.

## Structure

- `apps/storefront` — customer Storefront
- `apps/os` — staff Business OS
- `supabase` — the single ordered migration source for both applications

The applications deploy as separate Vercel projects. Database migrations run
before production web deployments.

## Local checks

Use Node.js 22 or newer.

```sh
npm ci
npm run check
```

## Browser-safe configuration

Both static builds accept these values during `npm run build`:

```sh
FLEURSTALES_SUPABASE_URL=https://your-project.supabase.co
FLEURSTALES_SUPABASE_PUBLISHABLE_KEY=your_publishable_key
```

Never put a Supabase secret key or service-role key in either web application.

## Release secrets

The manual production workflow expects:

- `SUPABASE_ACCESS_TOKEN`
- `SUPABASE_DB_PASSWORD`
- `SUPABASE_DB_URL` — direct Postgres connection string used only by the release job to run live smoke SQL after migration
- `SUPABASE_PROJECT_ID`
- `VERCEL_TOKEN`
- `VERCEL_ORG_ID`
- `VERCEL_STOREFRONT_PROJECT_ID`
- `VERCEL_OS_PROJECT_ID`
- `FLEURSTALES_SUPABASE_URL`
- `FLEURSTALES_SUPABASE_PUBLISHABLE_KEY`

Keep production release manual until the staging flow is verified.

## Supabase authority (V3.3)

V3.3 keeps the application UI/contracts compatible while completing the production staff/session foundation on top of V3.2. The ordered migrations after the V3.1 hardening add:

- revisioned Owner-configured section/action permissions and feature settings;
- command-scoped Payroll authority with HR/Finance separation;
- capability + branch/assignment scoped Orders authority and server actor evidence;
- RPC-owned Catalog/CRM/Store mutations;
- dedicated action-aware HR/Finance operational writers;
- immutable audit, durable business activity, per-user notifications, and Realtime;
- permission-aware notification delivery/read policies;
- Supabase Auth staff invitation + `staff_access_profiles` lifecycle synchronization;
- revisioned shared staff-role, attendance, scheduling, and payroll Settings;
- schedule-first per-session runtime operational branch context consumed by RLS;
- safe role-family eligibility for configurable capabilities;
- exactly-one-proposal semantics for final payroll payment.

Before production, run `npm run check:supabase-security`, apply every ordered
migration in `supabase/migrations`, then execute the database smoke tests:

- `supabase/tests/security_authorization_smoke.sql`
- `supabase/tests/v32_authorization_matrix_smoke.sql`
- `supabase/tests/v33_staff_settings_runtime_smoke.sql`

First-Owner provisioning is driven by trusted Supabase Auth app metadata; no
personal owner email is used as an authorization rule. New non-Owner staff are
created by the `staff-admin` Edge Function with an OS username and a strong production password (12+ characters with uppercase, lowercase, number, and symbol). The six-digit `123456` PIN remains local/demo-only.
The private Auth email is generated server-side when no email is supplied, and
the public `staff-login` Edge Function resolves username sign-in to Supabase
Auth without exposing that internal email. Both functions are deployed by the
manual production workflow after database migrations and before the web apps.
The web applications must never receive a service-role/secret key.


## Backend wiring completion (V3.5)

V3.5 closes the remaining prototype-only paths before a live backend cutover:

- the configured Storefront no longer hydrates prototype-wide Orders, CRM,
  Vouchers, HR, Finance, Payroll, or audit state from browser persistence;
- Storefront checkout preview and final submission use the same authoritative
  Supabase pricing and voucher rules;
- Business OS WhatsApp/walk-in Orders are created transactionally in Supabase;
- accepted Order payments/refunds update Finance atomically, and completed
  Orders generate server-owned contribution points;
- every signed-in staff role hydrates safe Store, branch, sellable Catalog, and
  role-scoped operational data before the OS opens;
- Admin/Florist schedules and self-attendance use dedicated RLS/RPC boundaries;
- Catalog image and Store-logo changes use Supabase Storage;
- CRM retries, conflicts, Realtime, customer segments, and the Audit UI use
  authoritative server state;
- production startup fails closed if required authority/settings/operational,
  Payroll, Store, Catalog, Orders, Customers, schedule, or attendance data cannot
  be hydrated. It does not silently open with prototype business data.

After applying every ordered migration in staging, also run:

- `supabase/tests/v35_backend_wiring_smoke.sql`

Then execute one complete Storefront Order and one Business OS WhatsApp/walk-in
Order through Finance, florist assignment, fulfillment, contribution points,
and Payroll using separate Owner, Admin, Finance, HR, and Florist sessions.

## Integrity and concurrency completion (V3.6)

V3.6 keeps the V3.5 wiring while closing the first production-integrity gaps:

- Storefront and internal Order idempotency keys are bound to canonical request
  hashes; concurrent duplicate requests return the winner unchanged, while the
  same key with a different payload is rejected;
- voucher eligibility counts verified paid business rather than unpaid Orders;
- Admin/Florist attendance branch, distance, schedule comparison, status, actor,
  and timestamps are derived server-side from the authenticated staff session;
- internal Order review uses the authoritative branch delivery fee and enforces
  strict unpaid/partial/paid amount rules;
- internal Order activities/notifications are emitted once and Owner-created
  Orders cannot generate Admin contribution points;
- CRM uses row-level three-way merge, visible conflict handling, and retry-safe
  writes/deletes;
- Catalog images use immutable content-versioned Storage paths and do not
  overwrite active objects before metadata commits;
- normalized employee point events are the persisted authority and the HR JSON
  array is rebuilt as their compatibility projection;
- failed production startup tears down subscriptions, local staff state, runtime
  branch context, and the Supabase session before returning to Login.

After applying all migrations through V3.6, also run:

- `supabase/tests/v36_integrity_concurrency_smoke.sql`

The smoke file checks database structure and grants. Staging must additionally
run simultaneous same-key/same-payload and same-key/different-payload requests,
direct attendance-RPC abuse cases, CRM concurrent edits, and Catalog image
revision conflicts because those behaviors cannot be proven by static checks.
## Authority consistency (V3.7)

V3.7 removes the remaining authority mismatches found after the V3.6 concurrency pass:

- Admin Order mutations use the per-session runtime branch all the way through the legacy validator;
- internal Order review uses an authoritative Supabase quote before confirmation;
- CRM VIP/spend/order-count metrics use the same verified-business rules as voucher pricing;
- internal Order customer-profile mutations advance CRM revisions;
- Florist access remains assigned-work read-only; Florists cannot change Order status;
- normalized employee point events are changed through dedicated server commands;
- Finance verification/rejection display actors are server-stamped;
- attendance selfies are stored in the private `attendance-selfies` bucket and rendered through signed URLs;
- production release now runs live schema lint plus all Fleurstales SQL smoke tests before Edge Function/web deployment.

The production workflow requires `SUPABASE_DB_URL` in GitHub Actions secrets. Use a trusted direct database connection string; it is never exposed to Storefront or Business OS builds.



## Florist Order read-only authority (V3.8)

V3.8 corrects the final Florist workflow rule: Florists may see only Orders
assigned to their staff identity, but cannot advance, undo, confirm Ready,
complete, cancel, or otherwise mutate an Order. `orders.advance_status` is
restricted to Owner/Admin in both the Business OS permission editor and
Supabase capability registry. The public Order mutation RPC rejects Florist
sessions before entering any historical internal writer.

After migration, run `supabase/tests/v38_florist_order_read_only_smoke.sql`.


## V3.11 production hardening

V3.11 is a focused hardening pass, not an architecture rewrite. It keeps the existing shared-data/Supabase contracts and adds:

- strong production staff passwords while retaining the six-digit PIN only for local/demo mode;
- username/IP throttling for the public `staff-login` bridge;
- RPC-only `staff_access_profiles` mutations;
- immutable, database-verified attendance selfie evidence;
- payload-free Admin roster refresh events;
- runtime-branch-aware Admin notifications;
- capability-aligned RLS where configured permissions already model the same authority;
- a disposable local database migration/smoke gate in CI and before production database changes; and
- a dedicated staging database release workflow.

Before a hosted Supabase project is used for staff login, mirror the V3.11 Auth password policy in the hosted project: minimum 12 characters and require lowercase, uppercase, numbers, and symbols. Existing production staff accounts created with six-digit credentials must reset to a strong password before use. `supabase/config.toml` contains the matching local/test policy.

For optional CORS restriction on `staff-login`, set the Supabase Edge Function secret `FLEURSTALES_ALLOWED_ORIGINS` to a comma-separated list of trusted Business OS origins. Login throttling is enforced independently of CORS.

## V3.12 branch attendance map picker

V3.12 keeps the V3.11 attendance authority model and improves only the Owner-facing branch location workflow in Business OS:

- replaces the static branch map preview with an interactive Leaflet picker;
- uses CARTO Voyager, an OpenStreetMap-based basemap, for a clean familiar road-map appearance;
- supports click-to-place, draggable pin, smooth pan/zoom, and high-accuracy current-location placement;
- draws the configured attendance acceptance radius directly around the branch pin;
- keeps exact latitude/longitude available as an advanced control rather than the primary interaction;
- preserves an OpenStreetMap iframe fallback if the interactive Leaflet asset cannot load.

The attendance database remains authoritative for location validation; this release changes only how Owners select the branch coordinates.
