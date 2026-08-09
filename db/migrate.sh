#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DATABASE_URL="${DATABASE_URL:-postgresql://lscala:lscala@localhost:5432/lscala}"

if ! command -v psql >/dev/null 2>&1; then
  echo "psql no está instalado. Instala PostgreSQL client o usa Docker Compose."
  exit 1
fi

echo "Aplicando migraciones en $DATABASE_URL"
for f in "$ROOT"/db/migrations/*.sql; do
  echo "→ $(basename "$f")"
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$f"
done
echo "OK"
