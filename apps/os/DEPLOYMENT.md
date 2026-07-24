# Deployment preparation

This build is a local production-shaped prototype, not the final public deployment.

## Current prototype runtime

```text
Frontend → local Node API → SQLite + local uploads
```

Run it with:

```bash
npm ci
npm run dev
```

## Before final hosted deployment

Replace infrastructure adapters only:

| Local prototype | Final deployment |
|---|---|
| SQLite | PostgreSQL or managed relational database |
| `backend/uploads/` | S3, Cloudflare R2, Supabase Storage, or equivalent |
| Local Node process | Hosted API service |
| Local database backups | Managed automated backups |
| Bootstrap PIN accounts | Production authentication and credential reset flow |

Do not deploy only the static `dist/` directory if the app is expected to retain shared operational data. The API, database, and file storage are required.

## Frontend API configuration

Localhost automatically uses:

```text
http://localhost:8787
```

A hosted frontend should define this before `main.js` loads:

```html
<script>
window.__FLEURSTALES_CONFIG__ = {
  apiUrl: 'https://api.example.com'
}
</script>
```

## Required production hardening

The prototype still requires production-grade server authorization, HTTPS, credential management, persistent deployment configuration, database backup policies, and object-storage access controls before real operational use.
