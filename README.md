# Boutique L'Scala — Sistema de Inventarios

Sistema Web de Gestión de Inventarios desarrollado por **Atria Solutions SpA** para **Boutique L'Scala**.

## Stack

- PostgreSQL
- Node.js + Express + TypeScript (`apps/api`)
- Vite + React + TypeScript (`apps/web`)

## Requisitos

- Node.js 20+
- PostgreSQL 16+ (local o vía Docker)

## Arranque rápido

```bash
cp .env.example .env

# Base de datos (Docker)
docker compose up -d

# O PostgreSQL local: crea DB/usuario lscala/lscala y:
npm run db:migrate   # incluye 019 (client_sale_id / sync offline POS)

npm install
npm run dev:api   # http://localhost:4000
npm run dev:web   # http://localhost:5173
npm run dev:print-agent   # http://127.0.0.1:9876 (opcional; ver atria-print-agent/)
```

El **Atria Print Agent** se instala aparte (`cd atria-print-agent && npm i`) — no está en workspaces npm. Detalle: [atria-print-agent/README.md](atria-print-agent/README.md).

### Credenciales seed

- Owner: `admin@lscala.cl` / `Admin123!`
- Vendedora: `vendedor@lscala.cl` / `Vendedor123!`

### Datos de demostración (presentación)

Carga un set boutique (jun 2026 → 17 ago 2026, TZ Chile). **Reemplaza** prendas `LS-1000xx`, boletas `V-D…` y gastos del demo; **no borra** admin.

```bash
npm run db:migrate      # incluye unificar barcode = código interno (LS-…)
npm run db:seed:demo    # o: bash db/seed-demo.sh
```

## Pruebas E2E y responsive

Suite de Playwright que audita en navegador real las rutas de la SPA en 360×740, 390×844,
430×932 y 1440×900 (scroll horizontal, objetivos táctiles, texto recortado, zoom de inputs en
iOS, CTA tapados y errores de consola) más los flujos críticos de piso.

```bash
npm run test:e2e:install   # navegador, una sola vez por máquina
npm run test:e2e           # suite completa (levanta api + web si hace falta)
npm run test:e2e:findings  # resumen priorizado P0/P1/P2
```

Detalle completo en [docs/runbooks/e2e-responsive.md](docs/runbooks/e2e-responsive.md).

## Documentación

- [docs/stack.md](docs/stack.md)
- [docs/architecture.md](docs/architecture.md)
- [docs/brand.md](docs/brand.md)
- [docs/runbooks/local.md](docs/runbooks/local.md)
