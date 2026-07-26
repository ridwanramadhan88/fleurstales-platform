#!/usr/bin/env bash
set -euo pipefail

DB_URL="${1:-${SUPABASE_DB_URL:-}}"
if [[ -z "$DB_URL" ]]; then
  echo "A PostgreSQL URL is required as argument 1 or SUPABASE_DB_URL." >&2
  exit 1
fi

mapfile -t tests < <(find supabase/tests -maxdepth 1 -type f -name '*.sql' -print | sort)
if [[ ${#tests[@]} -eq 0 ]]; then
  echo "No Supabase SQL smoke tests were found." >&2
  exit 1
fi

for sql in "${tests[@]}"; do
  echo "Running $sql"
  psql "$DB_URL" -X -v ON_ERROR_STOP=1 -f "$sql"
done

echo "Passed ${#tests[@]} Supabase SQL smoke tests."
