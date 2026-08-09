# Marca y UX — Boutique L'Scala

## Logo

Archivo: `apps/web/public/brand/lscala-logo.png`  
Circular fucsia con ave ornamental negra y wordmark L'Scala.

## Tokens

| Token | Valor | Uso |
|-------|-------|-----|
| `--color-brand` | `#E6007E` | CTAs, acentos, foco |
| `--color-brand-soft` | `#FF2D8A` | Hover / highlights |
| `--color-ink` | `#140910` | Texto, iconos |
| `--color-charcoal` | `#2A1A22` | Texto sobre stage claro |
| `--color-surface` | `#FFF8FB` | Fondo de trabajo |
| `--color-surface-elevated` | `#FFFFFF` | Paneles / form |
| `--color-login-banner` | `public/brand/login-banner.jpg` | Lookbook full-bleed del login (no reutilizar en dashboard) |
| `--color-muted` | `#6E5A64` | Texto secundario |
| `--color-line` | `#F0D6E4` | Bordes suaves |
| `--font-display` | "DM Sans" | Alias de body (sin serif; números legibles) |
| `--font-body` | "DM Sans" | UI, labels, formularios, CTA, montos |

## Login — acceso del equipo

1. Banner lookbook solo como atmósfera (sin copy de marketing).
2. Logo nítido en el panel blanco (marca + “Gestión · Boutique Calama”).
3. Copy operativo: inventario / ventas / caja para dueña y vendedoras.
4. Mobile: sheet sobre el banner; desktop: split.

## Principios generales

1. Brand-first en login (logo hero).
2. Una tarea principal por pantalla (POS, recibir, fotografiar).
3. Catálogo foto-first.
4. POS táctil (≥44px).
5. Tipografía: solo DM Sans (sin serif display; montos con `tabular-nums`).
6. Motion sobrio.
7. Español operativo de boutique.

## Navegación (post-login)

- **Sidebar desktop**: logo + Dashboard pinned + **primarios** (Ventas → `/vender`, Ingresos → `/ingresos`) + grupos
  (Operación: historial `/ventas` · Inventario: Productos/Inventario/Movimientos · Control · Admin solo owner).
  **Sin “Salir”** ni bloque “Puesto de trabajo” en el sidebar.
- **Header desktop**: Sucursal + Caja (`WorkplaceSwitcher`, solo `owner`) a la derecha; campana y menú de usuaria.
  Otros roles: etiqueta solo lectura de sucursal/POS.
- **Mobile**: bottom nav (Inicio, Ingresos, Ventas destacado, Stock) + hoja “Más” (resto; Sucursal/Caja para owner; Salir).
- **Redirect legacy**: `/compras` → `/ingresos` (misma pantalla; no usar “Compras” en UI).

## Tres módulos que no se confunden

| Módulo | Ruta | Para qué |
|--------|------|----------|
| **Ingresos** | `/ingresos` | Entrada de mercadería (factura o sin doc): líneas, Precio costo, recepción → stock |
| **Productos** | `/productos` | Catálogo: ficha, foto, código, precios de venta/costo, tipología |
| **Ventas** | `/vender` (POS) · `/ventas` (historial) | Cobrar en caja vs consultar tickets ya cerrados |

Ingreso crea/vincula productos y mueve stock; el catálogo no reemplaza el ingreso; el POS no registra compras.

## Precio costo

En UI: **“Precio costo”** = lo que costó la prenda al comprar (nunca usar el nombre de la dueña en la interfaz).

| Capa | Campo |
|------|--------|
| Línea de ingreso (`purchase_items`) | `unit_cost` |
| Producto en catálogo (`products`) | `cost_price` |

Al crear, vincular o recepcionar: `products.cost_price` ← `purchase_items.unit_cost`. Precio de venta sugerido ≈ 2× ese costo (editable).

## Assets del dashboard

Distintos del lookbook de login (`login-banner*`):

| Asset | Ruta | Uso |
|-------|------|-----|
| Hero | `/brand/dashboard-hero.jpg` | Stage full-bleed del resumen del día (`.dash-hero`) |
| Secundario | `/brand/dashboard-secondary.jpg` | Bloque editorial / vacío de actividad |

## Assets de producto (demo)

| Asset | Ruta | Uso |
|-------|------|-----|
| Foto producto | `/brand/fashion-jeans.jpg` | Imagen demo de prenda (catálogo, POS, placeholders) |

**No** usar `login-banner*` como foto de producto: es lookbook de atmósfera del login, no mercancía.

## POS (`/vender`)

- Stage **foto-first**: la prenda seleccionada se muestra grande; el ticket queda al lado / abajo.
- Búsqueda por código o nombre en **modal** (no barra fija en el stage).

## Action strip (Dashboard)

Franja de CTAs bajo el hero (`.dash-action-strip`): **Módulo de ventas** (`/vender`, primario) + **Módulo de ingresos** (`/ingresos`, secundario).

## Comboboxes / selects

Un solo patrón para toda la app (formularios y switchers), con `appearance:none` + flecha SVG propia:

- Formularios y drawers móviles: clase `.field select` (alto 52px, fondo blanco, flecha `#6E5A64`).
- WorkplaceSwitcher (owner): pills / selects de Sucursal/POS (incl. variante compacta en header).
- Estados: hover (`border` rosado suave), focus (halo `rgba(230,0,126,.28)`), disabled (opacidad 0.6).

## Notificaciones (campana)

- Fuente de datos real: `GET /api/dashboard/alerts` (stock bajo/quiebre, productos sin movimiento, vouchers de cambio
  por vencer), refresco cada 60s.
- Desktop: dropdown anclado a la campana (`.notif-panel`). Mobile: bottom sheet (`.notif-sheet`).
- Severidad: `sev-high` (quiebre de stock, rojo `#B00040`) y `sev-medium` (resto, fucsia marca).

## Gráficos del dashboard

- Librería: [Recharts](https://recharts.org/) (cargada en un chunk aparte, solo en Dashboard y Reportes).
- Paleta (`src/lib/chartColors.ts`): tonos fucsia/vino de marca — nunca colores genéricos arcoíris ni gradientes morados.
- Tooltips y ejes con tipografía `DM Sans`, sin grillas pesadas (`stroke: var(--color-line)`, sin bordes verticales).

## Badges de estado

Clase `.badge` (+ `success` / `warning` / `danger` / `brand`) para estados de ingresos, mermas, vouchers y stock —
reemplaza texto plano en tablas y listas.
