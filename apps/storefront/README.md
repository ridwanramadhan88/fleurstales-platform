# Fleurstales Operations Portal

Internal Fleurstales operations prototype built with React, TypeScript, Zustand, Tailwind, Radix UI, a local Node API, and SQLite.

## Requirements

- Node.js 22+
- npm 10+

Node 22 is required because the local prototype backend uses the built-in `node:sqlite` module.

## Install

```bash
npm ci
```

## Run the complete local prototype

```bash
npm run dev
```

This starts both the local SQLite backend and frontend. For frontend-only UI work, use:

```bash
npm run dev:frontend
```

This starts:

- Frontend development server
- Local API at `http://localhost:8787`
- SQLite database at `backend/database/fleurstales.db`
- Local uploaded files under `backend/uploads/`

The frontend automatically uses the local API when opened on `localhost` or `127.0.0.1`.

## Run services separately

```bash
npm run backend:start
npm run dev:frontend
```

## Database commands

```bash
npm run db:migrate
npm run db:seed
npm run db:backup
npm run db:reset
```

`db:reset` deletes the local SQLite database and local uploads. Run migrations and seed again afterward.

## Validation

```bash
npm run typecheck
npm test
npm run test:backend
npm run build
```

## Current storage structure

Structured prototype data is stored in SQLite tables for:

- Store settings and branches
- Employees, attendance, schedules, points, and payroll
- Customers
- Orders, order items, and activity history
- Catalog products, variants, and categories
- Inventory items, movements, transfers, and reservations
- Finance transactions
- Vouchers and notifications
- Application and server audit events

The existing frontend snapshot contract is retained as a compatibility boundary, but the backend decomposes every saved snapshot into domain slices and materialized tables inside one SQLite transaction.

Uploaded store logos are stored as files under `backend/uploads/store-logo/`; SQLite stores their metadata and URL.

## Test accounts

Bootstrap PIN: `123456`

- Owner: `owner`
- Finance: `finance`
- HR: `hr`
- Admin: `akbar`, `teta`, `shofi`
- Florist: `zahra`, `vero`, `zizi`, `dela`, `dila`, `gaby`

These accounts remain prototype credentials and must be replaced before public deployment.

See `backend/README.md`, `TESTING.md`, and `docs/business-rules/`.
