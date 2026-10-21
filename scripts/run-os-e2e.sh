#!/usr/bin/env bash
# Role-based end-to-end suite for the Business OS.
#
# Starts a LOCAL, disposable Supabase stack, replays every migration, seeds one
# throwaway staff account per role (apps/os/e2e/seed.sql), builds the OS against
# that stack and runs Playwright (apps/os/e2e). Nothing here touches staging or
# production.
set -euo pipefail

SUPABASE_CLI_VERSION="${SUPABASE_CLI_VERSION:-2.109.1}"
SUPABASE="npx -y supabase@${SUPABASE_CLI_VERSION}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# Services the OS never calls in the browser suite.
EXCLUDED="edge-runtime,studio,imgproxy,vector,logflare,supavisor,mailpit,postgres-meta"

cleanup() {
  if [[ "${E2E_KEEP_SUPABASE:-}" != "1" ]]; then
    $SUPABASE stop --no-backup >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

$SUPABASE start -x "$EXCLUDED"
$SUPABASE db reset --local

eval "$($SUPABASE status -o env | grep -E '^(API_URL|DB_URL|PUBLISHABLE_KEY)=')"

# A fresh throwaway password for this run only.
export E2E_STAFF_PASSWORD="${E2E_STAFF_PASSWORD:-e2e-$(node -e "process.stdout.write(require('node:crypto').randomBytes(12).toString('hex'))")}"
psql "$DB_URL" -X -q -v ON_ERROR_STOP=1 -v password="$E2E_STAFF_PASSWORD" -f apps/os/e2e/seed.sql

cd apps/os
FLEURSTALES_SUPABASE_URL="$API_URL" FLEURSTALES_SUPABASE_PUBLISHABLE_KEY="$PUBLISHABLE_KEY" node scripts/build.mjs --production
npx playwright test "$@"
