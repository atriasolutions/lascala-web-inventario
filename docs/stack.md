# Stack técnico — L'Scala Inventarios

| Capa | Tecnología | Ubicación |
|------|------------|-----------|
| Base de datos | PostgreSQL 16 | `db/migrations/` |
| Backend | Node.js + Express + TypeScript + `pg` | `apps/api` |
| Frontend | Vite + React + TypeScript | `apps/web` |
| Auth | JWT (roles + contexto sucursal/POS) | `apps/api` |
| Infra local | Docker Compose (solo Postgres) | `docker-compose.yml` |

Proveedor: **Atria Solutions SpA**. Cliente: **Boutique L'Scala**.
