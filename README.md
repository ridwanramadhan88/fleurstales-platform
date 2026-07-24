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
