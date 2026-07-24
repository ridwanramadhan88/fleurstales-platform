# Install and run

## Requirements

- Node.js 22+
- npm 10+

## Install dependencies

```bash
npm ci
```

## Start the complete local prototype

```bash
npm run dev
```

This starts both the local SQLite backend and frontend. For frontend-only UI work, use:

```bash
npm run dev:frontend
```

The first start automatically:

1. Creates `backend/database/fleurstales.db`.
2. Runs pending SQL migrations.
3. Seeds the existing prototype staff accounts.
4. Starts the Node API on port `8787`.
5. Starts the frontend development server.

## Manual setup

```bash
npm run db:migrate
npm run db:seed
npm run backend:start
```

In another terminal:

```bash
npm run dev:frontend
```

## Reset local prototype data

```bash
npm run db:reset
npm run db:migrate
npm run db:seed
```

This removes the local database and uploaded files. It does not change source code or demo seed definitions.
