#!/usr/bin/env bash
# Reemplaza el set de demostración (prendas LS1000xx, boletas VD…, gastos del período).
# No borra admin@lscala.cl ni el resto del seed base.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DATABASE_URL="${DATABASE_URL:-postgresql://lscala:lscala@localhost:5432/lscala}"

if ! command -v psql >/dev/null 2>&1; then
  echo "psql no está instalado. Instala PostgreSQL client o usa Docker Compose."
  exit 1
fi

BRAND="$ROOT/apps/web/public/brand"
missing=0
for n in 001 002 003 004 005 006 007 008 009 010 011 012 013 014 015 016; do
  f="$BRAND/demo-ls-100$n.png"
  if [[ ! -f "$f" ]]; then
    echo "Falta foto de catálogo: apps/web/public/brand/demo-ls-100$n.png"
    missing=1
  fi
done
if [[ "$missing" -ne 0 ]]; then
  echo "Genera las 16 fotos demo (una por prenda LS1000xx) antes de sembrar."
  exit 1
fi

echo "ATENCIÓN: este script borra y vuelve a cargar datos DEMO"
echo "  (productos LS1000xx, ventas VD…, gastos del local jun–ago 2026)."
echo "No toca admin@lscala.cl. Archiva prendas de prueba (QA / LS000…)."
echo "Base: $DATABASE_URL"
echo "→ $(basename "$ROOT/db/seed-demo.sql")"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$ROOT/db/seed-demo.sql"
echo "OK demo"
