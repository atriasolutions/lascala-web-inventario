# Despliegue DigitalOcean — L'Scala

Runbook para droplet Ubuntu 24.04 (Atria Solutions SpA).

## Prerrequisitos

| Recurso | Valor |
|---------|-------|
| Droplet IP | `138.68.45.159` |
| Dominio | `inventario.lscala.cl` |
| Repo | `https://github.com/atriasolutions/lascala-web-inventario.git` |
| App path | `/var/www/lscala` |

### SSH

Probar desde la máquina local:

```bash
ssh -o BatchMode=yes -o ConnectTimeout=10 -o StrictHostKeyChecking=accept-new root@138.68.45.159 echo ok
```

Si falla con `Permission denied (publickey)`, agregar la clave pública en **DigitalOcean → Droplet → Access → Add SSH key** (o consola web → Settings → SSH keys):

```bash
cat ~/.ssh/id_ed25519.pub
```

En este entorno funcionó `root` con la clave `~/.ssh/koracrm_do` (no `ubuntu` ni la clave GitHub por defecto).

## DNS (dueña / registrador)

Crear **antes de HTTPS**:

| Tipo | Nombre | Valor | TTL |
|------|--------|-------|-----|
| A | `inventario` | `138.68.45.159` | 300–3600 |

Resultado: `inventario.lscala.cl` → IP del droplet.

Verificar propagación:

```bash
dig +short inventario.lscala.cl
# debe responder: 138.68.45.159
```

## Stack instalado

- Docker + Compose (Postgres 16, solo `127.0.0.1:5432`)
- Node.js 20 (NodeSource)
- nginx (reverse proxy + SPA)
- certbot + plugin nginx
- pm2 (API en `:4000`)
- ufw: 22, 80, 443

## Variables de entorno (`.env` en `/var/www/lscala`)

No commitear. Ejemplo (generar `JWT_SECRET` con `openssl rand -hex 32`):

```env
DATABASE_URL=postgresql://lscala:lscala@127.0.0.1:5432/lscala
API_PORT=4000
JWT_SECRET=<aleatorio-64-hex>
JWT_EXPIRES_IN=12h
JWT_PERSISTENT_EXPIRES_IN=10y
CORS_ORIGIN=https://inventario.lscala.cl
WEB_ORIGIN=https://inventario.lscala.cl
VITE_API_URL=https://inventario.lscala.cl
```

**Antes de DNS:** usar `http://138.68.45.159` en `CORS_ORIGIN`, `WEB_ORIGIN` y rebuild con `VITE_API_URL=http://138.68.45.159`.

## Despliegue inicial

```bash
export APP_DIR=/var/www/lscala
git clone https://github.com/atriasolutions/lascala-web-inventario.git "$APP_DIR"
cd "$APP_DIR"
# crear .env (ver arriba)
chmod 600 .env

# Postgres local
sed -i 's/"5432:5432"/"127.0.0.1:5432:5432"/' docker-compose.yml
docker compose up -d

npm ci
npm run db:migrate
# NO ejecutar: npm run db:seed:demo

npm run build --workspace=@lscala/api
cd apps/web && VITE_API_URL=https://inventario.lscala.cl npx vite build

pm2 start npm --name lscala-api -- run start --workspace=@lscala/api
pm2 save && pm2 startup systemd -u root --hp /root
```

> **Nota build web:** si `npm run build` falla por archivos `*.test.ts`, usar `npx vite build` en `apps/web` (el repo remoto puede ir detrás del local en tsconfig).

## nginx

Sitio: `/etc/nginx/sites-available/lscala` — sirve `apps/web/dist`, proxy `/api/` y `/uploads/` → `127.0.0.1:4000`.

## HTTPS (después de DNS)

```bash
certbot --nginx -d inventario.lscala.cl --non-interactive --agree-tos -m admin@lscala.cl
```

Luego actualizar `.env` a `https://inventario.lscala.cl`, rebuild web y `pm2 restart lscala-api`.

## Base de datos limpia

- **Sí:** `npm run db:migrate` (incluye `010_seed.sql`: org, sucursal Calama, categorías, usuarios base).
- **No:** `npm run db:seed:demo` (datos QA/demo).

### Admin inicial (migración `010_seed.sql`)

| Email | Contraseña | Rol |
|-------|------------|-----|
| `admin@lscala.cl` | `Admin123!` | owner |
| `encargada@lscala.cl` | `Vendedor123!` | branch_manager |
| `vendedor@lscala.cl` | `Vendedor123!` | seller |

**Cambiar contraseñas en el primer acceso a producción.**

## Actualizar versión

```bash
cd /var/www/lscala
git pull --ff-only
npm ci
npm run db:migrate
npm run build --workspace=@lscala/api
cd apps/web && VITE_API_URL=https://inventario.lscala.cl npx vite build
pm2 restart lscala-api
```

## Backups

Ver [production.md](./production.md): `pg_dump` diario del volumen Docker o vía `DATABASE_URL`.

## URL temporal (sin DNS)

- Web: http://138.68.45.159
- Health: http://138.68.45.159/api/health
