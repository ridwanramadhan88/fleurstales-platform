# Fleurstales local prototype backend

This backend has the same broad shape intended for the final system while remaining fully local for prototype work.

```text
React frontend
    ↓ HTTP + SSE
Node API
    ↓
SQLite database + local uploads
```

No user-facing feature was added by this restructure. Existing prototype state, workflows, login, synchronization, backup, and logo upload behavior are preserved.

## Run

From the project root:

```bash
npm run backend:start
```

Or run the complete frontend + backend prototype:

```bash
npm run dev
```

## Local files

```text
backend/database/fleurstales.db
backend/uploads/
backend/data/backups/
```

These generated files are excluded from Git.

## Environment variables

```bash
PORT=8787
CORS_ORIGIN=http://localhost:8000
FLEURSTALES_DB_FILE=./backend/database/fleurstales.db
FLEURSTALES_USERS_FILE=./backend/users.json
FLEURSTALES_UPLOAD_DIR=./backend/uploads
FLEURSTALES_BACKUP_DIR=./backend/data/backups
FLEURSTALES_LEGACY_STATE_FILE=./backend/data/state.json
SESSION_HOURS=12
PUBLIC_BASE_URL=http://localhost:8787
```

`FLEURSTALES_LEGACY_STATE_FILE` is read only when a previous JSON backend file exists and SQLite has no operational state yet.

## Architecture

```text
backend/
├── database/
│   └── migrations/
├── scripts/
├── src/
│   ├── database/
│   ├── http/
│   ├── modules/
│   │   ├── auth/
│   │   ├── audit/
│   │   ├── files/
│   │   ├── operational-state/
│   │   └── resources/
│   ├── realtime/
│   └── app.mjs
├── tests/
└── server.mjs
```

The compatibility endpoint remains:

```text
GET/PUT/DELETE /state/operational-state
```

On every save, the backend:

1. Validates and parses the existing versioned snapshot.
2. Moves a newly uploaded Base64 store logo into local file storage.
3. Writes all domain slices and materialized tables inside one SQLite transaction.
4. Increments the resource revision.
5. Writes a server audit event.
6. Emits an SSE update.

Order synchronization also uses:

```text
GET /orders
PUT /orders/:id
GET /orders/stream
```

## Database commands

```bash
npm run db:migrate
npm run db:seed
npm run db:backup
npm run db:reset
```

## Migration path later

The final hosted backend can replace:

- SQLite with PostgreSQL
- Local uploads with S3, R2, or another object store
- Local Node process with a hosted API

Frontend workflows and the central business-rule layer do not need to change for that storage replacement.
