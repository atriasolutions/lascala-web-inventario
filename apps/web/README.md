# L'Scala Web — Boutique L'Scala

SPA Vite + React. Stack: ver `docs/stack.md`. Plan offline POS: `docs/pwa-offline-pos.md`.

## Desarrollo

```bash
# desde la raíz del monorepo
npm run dev:web
# o
npm run -w @lscala/web dev
```

Build de producción (incluye Service Worker / manifest PWA):

```bash
npm run -w @lscala/web build
npm run -w @lscala/web preview   # sirve dist/ con HTTPS local de Vite
```

## PWA (Fase A + B + C)

La build genera una Progressive Web App instalable (**L'Scala Caja**).

- Manifest + iconos de marca en `public/brand/pwa-*.png`
- Service Worker: precache de **assets** de la app
- Banner “Sin conexión” + hint de instalación
- **Fase B:** catálogo POS en IndexedDB; Caja lee offline; otros módulos bloqueados sin red
- **Fase C:** cola de ventas offline + sync FIFO a `POST /api/sales/offline-sync`

**Antes de probar sync:** desde la raíz del monorepo, `npm run db:migrate` (migración `019_sales_client_sale_id.sql`).

Guía de instalación: [`docs/pwa-install.md`](../../docs/pwa-install.md). Plan: [`docs/pwa-offline-pos.md`](../../docs/pwa-offline-pos.md).
