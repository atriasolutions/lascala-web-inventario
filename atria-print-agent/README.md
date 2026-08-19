# Atria Print Agent

**Proveedor:** Atria Solutions SpA · **Cliente:** Boutique L'Scala (Calama)

Puente local HTTP → spooler (reemplazo previsto de QZ Tray).  
**Fase 4:** `POST /print/raw` envía TSPL/raw al spooler (macOS `lp -o raw`; Windows Winspool RAW).  
La SPA sigue generando el TSPL (`buildLabelTspl`); el Agent solo transporta bytes.

Contratos: `docs/qz-tray-analysis.md`, `docs/atria-print-agent-architecture.md`.

## Requisitos

- Node.js **≥ 20**
- macOS (CUPS: `lpstat` / `lp`) o Windows 10+ (PowerShell + Winspool)

Instalación aparte (no está en workspaces del monorepo):

```bash
cd atria-print-agent && npm install && npm run dev
# raíz: npm run dev:print-agent
```

Bind: **solo** `127.0.0.1:9876`.

```bash
npm test && npm run typecheck
```

## Dependencias de impresión

**Sin libs nativas npm.**

| Plataforma | Listado | Print RAW |
|------------|---------|-----------|
| macOS | `lpstat` | `lp -d <cola> -o raw -t <job>` (stdin; fallback archivo temp) |
| Windows | `Get-CimInstance Win32_Printer` | PowerShell + `winspool.drv` (`OpenPrinter` / `WritePrinter` RAW) |

`copies` en el body se **ignora** si el TSPL ya trae `PRINT n,1` (paridad QZ: un solo job).

## Endpoints

| Método | Ruta | Estado |
|--------|------|--------|
| `GET` | `/health` | OK |
| `GET` | `/printers` | Lista real |
| `GET` | `/printers/:name/status` | Detalle / `404 PRINTER_NOT_FOUND` |
| `POST` | `/print/raw` | RAW/TSPL → spooler (`-o raw` / Winspool RAW) |
| `POST` | `/print` | Alias: `format=html` → ESC/POS; resto → raw |
| `POST` | `/print/html` | Comprobante: HTML→**ESC/POS texto**→RAW (nunca PDF). `sample:true` = prueba corta |
| `GET` | `/jobs/:id` | Estado de cola |

**Tipos de job**

| Tipo | Endpoint | Transporte | Uso |
|------|----------|------------|-----|
| Etiqueta | `/print/raw` | TSPL bytes + `-o raw` | XP-420B 50×25 |
| Comprobante | `/print/html` | HTML→ESC/POS + `-o raw` | Térmica ticket 80 mm (no Brother inkjet / no XP-420B) |

> **No** mandar PDF/HTML a una térmica ESC/POS: imprime basura y puede vaciar el rollo.
> Brother DCP (inkjet) no es impresora de tickets; usa una térmica ESC/POS dedicada en el perfil «comprobantes».

### Prueba corta (sin gastar el rollo)

```bash
# ~6 líneas + corte parcial. Cambia el nombre de impresora CUPS.
curl -s -X POST http://127.0.0.1:9876/print/html \
  -H 'Content-Type: application/json' \
  -d '{"printer":"Epson_TM_T20","sample":true,"jobName":"prueba-corta"}' | jq
```

Errores: `INVALID_REQUEST`, `UNSUPPORTED_FORMAT`, `PRINTER_NOT_FOUND`, `PRINTER_OFFLINE`, `PRINT_FAILED`, `UNSUPPORTED`.

Cola: `pending` → `printing` → `completed` \| `failed`.

## Curl — etiqueta TSPL (cuando conectes la XP-420B)

Estructura idéntica a `buildLabelTspl` (SIZE 50×25, BARCODE 128, `PRINT 1,1`).  
**Prueba física pendiente** si la impresora está desconectada en desarrollo: el Agent responderá error estructurado (`PRINTER_NOT_FOUND` / `PRINTER_OFFLINE` / `PRINT_FAILED`), no se cuelga.

```bash
# Agent en marcha: npm run dev

curl -s http://127.0.0.1:9876/health | jq
curl -s http://127.0.0.1:9876/printers | jq

# Imprimir 1 etiqueta de muestra a la cola CUPS/Win exacta:
curl -s -X POST http://127.0.0.1:9876/print/raw \
  -H 'Content-Type: application/json' \
  -d '{
    "printer": "Xprinter_XP-420B",
    "format": "tspl",
    "encoding": "utf8",
    "jobName": "sample-label",
    "data": "SIZE 50 mm,25 mm\r\nGAP 2 mm,0\r\nDIRECTION 1\r\nREFERENCE 0,0\r\nSET TEAR ON\r\nCLS\r\nTEXT 85,40,\"2\",0,1,1,\"Atria Sample\"\r\nBARCODE 52,70,\"128\",82,0,0,2,4,\"TEST001\"\r\nTEXT 118,156,\"1\",0,1,1,\"TEST001\"\r\nPRINT 1,1\r\n"
  }' | jq

# Consultar job:
curl -s http://127.0.0.1:9876/jobs/<jobId> | jq
```

Éxito típico: `{ "ok": true, "jobId": "...", "status": "completed" }`.

Si usas token local: header `X-Atria-Print-Token`.

## Cómo se envía RAW

- **macOS:** `lp -d Xprinter_XP-420B -o raw -t sample-label` con el string TSPL por stdin (timeout 20s).
- **Windows:** archivo temp + script PowerShell Winspool `pDataType = "RAW"` (timeout 25s).

## Config local (sin PII)

| OS | Ruta |
|----|------|
| macOS | `~/Library/Application Support/AtriaPrintAgent/` |
| Windows | `%APPDATA%\AtriaPrintAgent\` |

## Empaquetado / instalable (Fase 7)

```bash
npm run pack:mac   # → packaging/out/AtriaPrintAgent.dmg (+ .app + zip)
npm run pack:win   # → packaging/out/win-payload + .iss (Setup.exe con Inno en Windows)
```

Usuario final: ver [`docs/atria-print-agent-installation.md`](../docs/atria-print-agent-installation.md).  
**Sin Electron.** Runtime = Node 20 LTS embebido + **tray-hook** (MIT, daemon Rust) para ícono en la barra de menú.

Conflicto con `npm run dev`: solo uno en `:9876`.  
`launchctl bootout gui/$(id -u)/com.atria.print-agent`

## Limitaciones

- **Prueba física**: validar etiqueta XP-420B y comprobante ESC/POS en térmica 80 mm real.
- Comprobantes: path ESC/POS RAW. No uses la XP-420B (TSPL) ni una inkjet Brother como «comprobantes».
- QZ en `apps/web` sigue como fallback si el Agent falla.

## Empaquetado (Fase 7+) — placeholders

```bash
# npm run package:win   # TODO Setup.exe
# npm run package:mac   # TODO .dmg + LaunchAgent
```
