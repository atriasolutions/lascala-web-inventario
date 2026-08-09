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
npm run db:migrate

npm install
npm run dev:api   # http://localhost:4000
npm run dev:web   # http://localhost:5173
```

### Credenciales seed

- Owner: `admin@lscala.cl` / `Admin123!`
- Vendedora: `vendedor@lscala.cl` / `Vendedor123!`

## Documentación

- [docs/stack.md](docs/stack.md)
- [docs/architecture.md](docs/architecture.md)
- [docs/brand.md](docs/brand.md)
- [docs/runbooks/local.md](docs/runbooks/local.md)
