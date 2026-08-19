# Marca y UX — Boutique L'Scala

## Logo

Archivo: `apps/web/public/brand/lscala-logo.png`  
Circular fucsia con ave ornamental negra y wordmark L'Scala.

### Logo Atria Solutions (Print Agent)

Proveedor del puente de impresión. Isotipo “A” metálico azul (en preview parece fondo negro; el PNG canónico ya incluye transparencia).

| Ruta | Rol |
|------|-----|
| `atria-print-agent/assets/atria-logo.png` | **Canónico** del Agent (Dock `.icns`, DMG, Inno) |
| `atria-print-agent/assets/tray-icon.png` (+ `@2x`) | Menu bar / tray (fondo transparente derivado) |
| `docs/brand/atria-logo.png` | Copia del canónico para documentación |

Detalle: [`atria-print-agent-installation.md`](./atria-print-agent-installation.md) §6. No sustituye la marca L'Scala en la SPA (PWA / `apps/web/public/brand`).

## Tokens

Fuente de verdad en CSS: `apps/web/src/styles/index.css` (`:root`). No inventar escalas paralelas.

### Color

| Token | Valor | Uso |
|-------|-------|-----|
| `--color-brand` | `#E6007E` | CTAs, acentos, foco |
| `--color-brand-soft` | `#FF2D8A` | Hover / highlights |
| `--color-brand-deep` | `#B80065` | Gradiente CTA |
| `--color-ink` | `#140910` | Texto, iconos |
| `--color-charcoal` | `#2A1A22` | Texto sobre stage claro |
| `--color-surface` | `#FFF8FB` | Fondo de trabajo |
| `--color-surface-elevated` | `#FFFFFF` | Paneles / form |
| `--color-muted` | `#6E5A64` | Texto secundario |
| `--color-line` | `#F0D6E4` | Bordes suaves |
| `--color-success` | `#1F7A4C` | Éxito / stock OK |
| `--color-danger` | `#B00040` | Error / quiebre |
| `--color-login-banner` | `public/brand/login-banner.jpg` | Lookbook del login (no reutilizar en dashboard) |
| `--font-display` / `--font-body` | DM Sans | UI completa (sin serif) |

### Espaciado (escala 4px)

| Token | px | Uso típico |
|-------|-----|------------|
| `--space-1` … `--space-8` | 4 / 8 / 12 / 16 / 24 / 32 / 48 / 64 | micro → editorial |
| `--page-pad` | = `--space-4` | padding de página |

Preferir esta escala frente a gaps sueltos (`0.85rem`, etc.).

### Tipografía

| Token | ≈px | Uso |
|-------|-----|-----|
| `--text-xs` | 12 | labels uppercase de tabla |
| `--text-sm` | 13 | muted / meta |
| `--text-md` | 14 | body de tablas |
| `--text-base` | 16 | inputs (sin zoom iOS) |
| `--text-lg` / `--text-xl` | 18–22 | títulos de sección |
| `--text-kpi` | 28–36 | montos KPI |

Pesos **400 / 500 / 600 / 700**. Montos con `tabular-nums`. Helpers: `.text-muted`, `.text-body`, `.text-title`, `.text-kpi`.

### Radios, sombras, tablas

| Token | Valor | Uso |
|-------|-------|-----|
| `--radius` | 20px | cards / sheets |
| `--radius-sm` | 14px | inputs / filas |
| `--radius-pill` | 999px | botones |
| `--shadow-soft` | … | listas / superficies |
| `--shadow` | … | **solo overlays** |
| `--table-row-h` | 54px | densidad desktop |
| `--table-cell-py` | 11px | padding vertical |

Header sticky en desktop; sin sombra por fila; montos a la derecha (`.num` / `.amount`).

### Focus, disabled, motion

| Token | Valor |
|-------|-------|
| `--focus-ring` | halo 2px + offset marca |
| `--opacity-disabled` | `0.6` |
| `--duration-fast` / `--duration-base` / `--duration-sheet` / `--duration-slow` | 120 / 140 / 180 / 200 ms |
| `--ease-out` | `cubic-bezier(0.16, 1, 0.3, 1)` |

Estados: hover borde marca **140ms**; press `scale(0.98)` solo en `.btn`; focus ring; disabled 0.6.

### Motion activo

Solo `transform` / `opacity`. `prefers-reduced-motion: reduce` anula **todos** los keyframes.

| Efecto | Trigger | Duración |
|--------|---------|----------|
| Sheet/modal | `.pos-modal-panel` → `sheetRise` | 180ms |
| Overlay | `rise` | 160–180ms |
| Pulse escaneo | `.pos-stage.is-pulse` → `scanPulse` | 200ms |
| Fila carrito | `.pos-cart-row` → `cartRowIn` | 180ms |
| KPI entrada (1×) | `.dash-kpi strong` → `kpiIn` | ≤200ms |
| Skeleton | `skelShimmer` unificado | 1.2s loop |
| Botón hover/press | `.btn` | 140ms |

No animar el foco del input de código en POS/Ingresos.

### Densidad de referencia

Plantilla limpia: **Ajustes**. Nivelado: Mermas (menos aire), Productos (`--space-3`), tablas densas tipo Ventas/Ingresos. AppShell posee el título de ruta — no duplicar `h1` en `.page-intro`.

**Prohibido:** purple/indigo, cream+serif terracotta, glassmorphism decorativo, glow neón, clusters de pills, dark mode por defecto.

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
6. Motion sobrio (default to stillness; ver tokens de motion).
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
