#!/usr/bin/env bash
# Applies the migrations to a throwaway local Postgres and runs the checks.
# Usage: supabase/tests/run.sh   (needs Postgres server binaries on the machine)
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
bin="${PG_BIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | tail -1)}"
dir="$(mktemp -d)"
trap '"$bin/pg_ctl" -D "$dir/data" stop -m immediate >/dev/null 2>&1 || true; rm -rf "$dir"' EXIT
"$bin/initdb" -D "$dir/data" -U postgres >/dev/null
"$bin/pg_ctl" -D "$dir/data" -o "-k $dir -c listen_addresses=''" -l "$dir/log" start >/dev/null
psql() { command psql -h "$dir" -U postgres -d postgres -v ON_ERROR_STOP=1 -q "$@"; }
psql -f "$here/supabase_stub.sql"
for f in "$here"/../migrations/*.sql; do psql -f "$f"; done
psql -f "$here/../migrations/20261009000002_migrate_v1.sql"  # re-run must be a no-op
psql -f "$here/rls_test.sql"
for f in "$here"/../seed/*.sql; do psql -f "$f" >/dev/null; psql -f "$f" >/dev/null; done  # seeds apply and re-apply cleanly
psql -At -c "select 'menu items: ' || count(*) from menu_items" -c "select 'sizes: ' || count(*) from menu_sizes" -c "select 'portions: ' || count(*) from size_portions" -c "select 'recipes (non-V1): ' || count(*) from kitchen_recipes where v1_id is null"
