# Runbook local

## Postgres con Docker

```bash
docker compose up -d
# Las migraciones en db/migrations se aplican en el primer init del volumen.
```

Si el volumen ya existía vacío de schema:

```bash
npm run db:migrate
```

## Postgres sin Docker

```bash
createdb lscala
createuser lscala -P   # password: lscala
psql -d lscala -c "GRANT ALL ON DATABASE lscala TO lscala;"
export DATABASE_URL=postgresql://lscala:lscala@localhost:5432/lscala
npm run db:migrate
```

## Apps

```bash
cp .env.example .env
npm install
npm run dev:api
npm run dev:web
```

Health: `GET http://localhost:4000/api/health`

## Datos de demostración

Tras migrar, para una presentación con dashboard vivo (ropa femenina Calama, jun–ago 2026):

```bash
npm run db:seed:demo
```

El script avisa que **borra/reemplaza** el set demo (`LS-1000xx`, ventas `V-D…`, gastos). No elimina `admin@lscala.cl`. Fotos en `apps/web/public/brand/demo-*.png`.
