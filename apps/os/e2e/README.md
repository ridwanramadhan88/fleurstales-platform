# Business OS end-to-end suite

Runs the production build of the OS in Chromium against a **local, disposable**
Supabase stack. It never touches staging or production.

```bash
./scripts/run-os-e2e.sh            # whole suite
./scripts/run-os-e2e.sh -g florist # filter by test title
```

Requirements: Docker, Node 22, `psql`. Install the browser once with
`npx playwright install chromium` (CI uses `--with-deps`).

## What it covers

| Spec | What it proves |
|---|---|
| `roles.spec.ts` | Every role (owner, admin, finance, hr, florist) opens every sidebar section and visible tab without console errors, failed Supabase requests, persistent alerts, or visible English copy. |
| `roles.spec.ts` | Switching accounts in the same tab leaves no stale "changes not saved / SESSION_REQUIRED" notice (#142). |
| `roles.spec.ts` | Reloading as HR never calls admin-only catalog RPCs (#144). |
| `order-flow.spec.ts` | Admin creates a cash pickup order, confirms it paid (#145), assigns the florist and starts production; the florist sees it and uploads the finish photo. |
| `refund-flow.spec.ts` | Finance and Owner start a refund on a paid order; cancelling a paid order queues its refund; Finance completes each refund from the refund queue with the paying account. Toasts must be visible and Indonesian. |

Every test also fails on any console error or any 4xx/5xx response from
Supabase (the server error code is included in the failure; see `fixtures.ts`
for the short, documented ignore list). Shared order steps live in `orders.ts`.

## Accounts

`seed.sql` creates `e2e-<role>@fleurstales.test` for each role with a random
password generated per run (`E2E_STAFF_PASSWORD`). The seed refuses to run on a
database that already contains non-E2E staff accounts.

## Adding a test

Prefer real user flows over UI details, assert outcomes the user sees, and call
`englishLines(page)` on new screens so untranslated copy is caught.
