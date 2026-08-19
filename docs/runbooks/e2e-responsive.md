# Runbook — Pruebas E2E y responsive (Playwright)

Suite automatizada que verifica en un navegador real el comportamiento responsive de la SPA y
un par de flujos críticos de piso. Sustituye la revisión "leyendo CSS" de las rondas anteriores.

## Requisitos

1. PostgreSQL con la base sembrada (`npm run db:migrate` y `npm run db:seed`).
2. Navegador de Playwright instalado (una sola vez por máquina):

```bash
npm install
npm run test:e2e:install   # equivale a: npx playwright install chromium
```

La suite levanta `@lscala/api` (:4000) y `@lscala/web` (:5173) automáticamente. Si ya los tienes
corriendo, los reutiliza (`reuseExistingServer`).

## Comandos

| Comando | Qué hace |
|---|---|
| `npm run test:e2e` | Suite completa: 4 viewports × 17 rutas + flujos críticos |
| `npm run test:e2e:mobile` | Solo los tres viewports móviles |
| `npm run test:e2e:responsive` | Solo la auditoría responsive |
| `npm run test:e2e:flows` | Solo los flujos críticos (390×844) |
| `npm run test:e2e:ui` | Modo interactivo de Playwright |
| `npm run test:e2e:findings` | Resumen priorizado P0/P1/P2 en Markdown |
| `npm run test:e2e:report` | Abre el reporte HTML |

Credenciales y URLs se pueden sobreescribir con `E2E_EMAIL`, `E2E_PASSWORD`, `E2E_WEB_URL`,
`E2E_API_URL`.

## Viewports

| Proyecto | Tamaño | Para qué |
|---|---|---|
| `mobile-360` | 360 × 740 | Android chico, el peor caso en sala |
| `mobile-390` | 390 × 844 | iPhone 14/15 — referencia de piso |
| `mobile-430` | 430 × 932 | iPhone Pro Max |
| `desktop` | 1440 × 900 | Escritorio de referencia |

## Qué detecta la auditoría

Por cada ruta y viewport (`tests/e2e/support/audit.ts`):

- **Scroll horizontal** — `documentElement.scrollWidth > clientWidth`, con los elementos culpables.
- **Objetivos táctiles < 44px** — botones, enlaces, inputs, selects y roles interactivos.
  Solo se evalúa en los proyectos móviles: el mínimo de 44px es un requisito táctil.
  Los enlaces de texto en línea se reportan como P2 (WCAG 2.5.5 los exceptúa).
- **Texto recortado** — nodos con `overflow` oculto o `text-overflow: ellipsis` cuyo
  `scrollWidth` supera el `clientWidth`. Se ignora el patrón `.sr-only` (cajas de 1×1 px).
- **Campos de texto con `font-size` < 16px** — provocan zoom automático en iOS. Solo móvil, y
  solo en campos de entrada de texto (no en checkboxes ni radios).
- **CTA principal inaccesible** — el botón primario de cada vista debe estar visible, dentro del
  viewport y responder a `elementFromPoint` (no tapado por la barra fija ni por la bottom nav).
  En móvil se comprueba además que el acceso a Caja de la bottom nav sea clickeable.
- **Errores de consola y requests ≥ 400** durante la navegación.

Ruido de entorno local que se ignora a propósito: QZ Tray, HMR de Vite y `favicon.ico`.

## Salidas

| Ruta | Contenido |
|---|---|
| `test-results/screenshots/<viewport>/<ruta>.png` | Capturas de página completa para revisión humana |
| `test-results/responsive/<viewport>__<ruta>.json` | Auditoría cruda por ruta (métricas + hallazgos) |
| `test-results/responsive-findings.md` | Resumen priorizado (`npm run test:e2e:findings`) |
| `playwright-report/` | Reporte HTML con trazas de los fallos |

Las capturas son para revisión visual humana: **no** hay comparación de snapshots pixel a pixel,
por eso no existe un script de "actualizar snapshots". Si más adelante se agrega
`toHaveScreenshot()`, el comando sería `npx playwright test --update-snapshots`.

## Flujos críticos (390 × 844)

`tests/e2e/flows.spec.ts`, con sesión real:

1. Login con credenciales de piso y aterrizaje en el dashboard.
2. Cambio de sucursal desde el sheet «Más» (se salta si la organización tiene una sola).
3. Caja (POS): buscar una prenda y agregarla al carro.
4. Gastos: abrir el sheet «Nuevo gasto» y comprobar que no genera desborde horizontal.

**Fuera de alcance a propósito:** impresión de etiquetas, comprobante térmico y QZ Tray. Eso lo
valida la usuaria a mano con hardware real.

## Datos de prueba

`tests/e2e/support/global-setup.ts` inicia sesión contra la API, guarda el token y la sucursal en
`.playwright/storage-state.json`, y resuelve un id de compra real para `/ingresos/:id`. Si no hay
compras sembradas, esa ruta se marca como **skipped** en vez de dar un falso verde.
