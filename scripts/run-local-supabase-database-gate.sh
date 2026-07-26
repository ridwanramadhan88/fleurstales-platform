#!/usr/bin/env bash
set -euo pipefail

SUPABASE_CLI_VERSION="${SUPABASE_CLI_VERSION:-2.109.1}"
LOCAL_DB_URL="${LOCAL_SUPABASE_DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"

cleanup() {
  npx -y "supabase@${SUPABASE_CLI_VERSION}" stop --no-backup >/dev/null 2>&1 || true
}
trap cleanup EXIT

npx -y "supabase@${SUPABASE_CLI_VERSION}" start
npx -y "supabase@${SUPABASE_CLI_VERSION}" db reset --local
npx -y "supabase@${SUPABASE_CLI_VERSION}" db lint --local --schema public --level error --fail-on error
./scripts/run-supabase-smoke-tests.sh "$LOCAL_DB_URL"
