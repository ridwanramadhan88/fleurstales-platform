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
| `finance-reconciliation.spec.ts` | Order goes ready (finish photo) and picked up; Finance reconciles it with a code through the server RPCs and the code survives a reload. |
| `customer-birthday.spec.ts` | The seed adds a customer born today and runs the daily job; the Admin sees "Ulang tahun pelanggan hari ini" (opens Customers), the Florist does not. Recipients, dedupe and 29 Feb are covered by `customer_birthday_notifications_smoke.sql`. |
| `finance-report.spec.ts` | Finance opens Keuangan → Laporan and the Owner opens Pendapatan; both see the PNL summary (Fleurstales/Fleurstation, previous month, growth) and download `LK_<Bulan>_<Tahun>.xlsx` with the LK sheets. Figures are covered by `financeLkReportDomain.test.ts`, read access by `finance_report_read_smoke.sql`. |
| `payroll-overtime.spec.ts` | The seeded E2E Florist checked out 95 minutes after the shift and chose "Lembur". HR approves it in Kehadiran → Tinjauan kehadiran with a manual duration and amount, generates payroll in Penggajian and sees the overtime as a Tambahan line, then adds a Fee line (total Rp 195.000). Guard rules are covered by `payroll_overtime_additions_smoke.sql`, store rules by `payrollOvertimeAdditions.test.ts`. |
| `finance-edit-void.spec.ts` | Finance lowers a paid order payment (the order's paid amount follows), then voids it: the row stays struck through with its reason and the order is cancelled. Transfers as a pair, refunds, closed months, the void freeze and permissions are covered by `finance_edit_void_smoke.sql`. |
| `voucher-amount.spec.ts` | Admin creates a Rupiah voucher (listed as -Rp20.000); review promo settings show the Rp20.000 reward. Discount maths, the review form's required fields and the reward on the next checkout are covered by `voucher_amount_review_reward_smoke.sql`. |
| `branch-qris.spec.ts` | Owner uploads a static QRIS for a branch (square image, linked bank account); a non-square image is rejected; the QRIS survives a reload. Checkout with QRIS is covered by `branch_qris_smoke.sql` and storefront unit tests. |
| `branch-fulfillment-hours.spec.ts` | New order only offers pickup times inside the branch pickup & delivery hours (Kedamaian 08.00–16.00, not the 07.00 opening time); Owner branch settings show the hours in Indonesian. |
| `staff-accounts.spec.ts` | Owner creates a staff account (login + HR employee in one server call), deactivates it and saves the profile (the login must stay disabled — production bug 6 Nov 2026), reactivates it, changes the username, and removes it permanently without an HR conflict; HR edits an employee that has no login; HR emails a password reset link and the email arrives (mailpit). Create, deactivate, remove and access screens must have no English copy. Needs the `staff-admin` Edge Function (edge-runtime and mailpit are started by `run-os-e2e.sh`). |
| `payment-proof.spec.ts` | Admin attaches a transfer proof while confirming payment; Admin and Owner open it from the order details ("Lihat bukti transfer"); Finance sees it in the review (signed preview + full view) and from the ledger row; a Florist cannot get a signed link even by calling Storage directly. |

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
