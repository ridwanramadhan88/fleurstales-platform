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
created by the `staff-admin` Edge Function with an OS username and six-digit PIN.
The private Auth email is generated server-side when no email is supplied, and
the public `staff-login` Edge Function resolves username sign-in to Supabase
Auth without exposing that internal email. Both functions are deployed by the
manual production workflow after database migrations and before the web apps.
The web applications must never receive a service-role/secret key.
