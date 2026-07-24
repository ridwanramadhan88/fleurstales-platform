# Testing and validation

## Full validation

```bash
npm ci
npm run check
```

`npm run check` runs, in order:

1. TypeScript strict checks, including unused locals and parameters.
2. The complete Vitest frontend/domain/store/workflow suite.
3. Local SQLite backend integration tests.
4. The production build.

## Individual commands

```bash
npm run typecheck
npm test
npm run test:backend
npm run test:workflows
npm run test:coverage
npm run build
```

## Coverage areas

The suite protects the current prototype features, including:

- Role and branch permissions.
- Order creation, pricing, lifecycle, assignment, and fulfillment.
- Florist production progress and Admin Ready confirmation.
- Finance verification, locks, change requests, refunds, and revenue math.
- Catalog, inventory, customers, vouchers, HR, attendance, scheduling, and payroll.
- Settings integrity, persistence migrations, snapshot conflicts, and backups.
- Storefront cart and checkout flows.
- SQLite persistence, materialized domain tables, sessions, local uploads, and revision conflicts.

Tests use isolated temporary persistence where required and must not depend on an existing local database.


## UX integrity regression coverage

The workflow suite also protects the prototype's role-by-role user paths:

- Owner: Overview → Orders → Finance → People → Settings.
- Admin: scheduled-branch Orders and Customers, including the blocked/off-shift state.
- Finance: Overview reachability, deterministic Payment Verification/Payroll/Refunds/Ledger navigation, shared search, and read-only empty states.
- HR: Overview → Employees → Attendance → Scheduling → Performance/Payroll preparation.
- Florist: My Work schedule and attendance. Production status remains Admin-controlled by product decision; no separate Florist order-status workflow is implied.

UX regression rules:

- Navigation grouping is presentation-only and never grants access.
- Mobile primary and Workspace destinations together cover every accessible top-level destination without duplicates.
- Branch-scoped staff require an active branch assignment for order visibility or creation.
- Blocked actions remain visible only when the role normally owns the action, and explain the next responsible role or prerequisite.
- Critical workspaces always render a heading and meaningful empty state instead of returning a blank page.
- Only one search or Save/Cancel action surface is visible per responsive breakpoint.
