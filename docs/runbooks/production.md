# Runbook producción

## Build

```bash
cp .env.example .env   # completar JWT_SECRET y DATABASE_URL
npm install
npm run db:migrate
npm run build
```

## Ejecutar API

```bash
npm run start --workspace=@lscala/api
```

## Web

Servir `apps/web/dist` con nginx/CDN. Configurar `VITE_API_URL` al build.

## Backups

- `pg_dump $DATABASE_URL > backup-$(date +%F).sql` diario
- Retener mínimo 7 días

## Secretos

- Rotar `JWT_SECRET` en producción
- No commitear `.env`
