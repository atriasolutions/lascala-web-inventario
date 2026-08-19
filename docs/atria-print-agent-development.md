# Atria Print Agent — Desarrollo

**Fase:** **3** — health + printers/status reales; print → 501  
**Audiencia:** equipo Atria (no usuarias de boutique)

---

## 1. Dev vs producción

| | Desarrollo | Producción (PC boutique) |
|--|------------|---------------------------|
| Quién | Devs Atria | Dueña / vendedoras |
| Cómo corre | `npm run dev` con **Node ≥20** | **Instalable** Setup.exe / .dmg |
| Toolchain | Git, npm, editor | Ninguna |
| Auto-start | No necesario | Obligatorio al login |
| Token | Suele `null` (abierto en loopback) | Generado / emparejado |
| Listado impresoras | **Real** (lpstat / Win32_Printer) | Igual |
| Impresión | **501** hasta Fase 4+ | RAW Winspool / CUPS |

Mismo código en `atria-print-agent/`.

---

## 2. Ubicación: carpeta hermana (no workspace)

```text
LSCALA/
  atria-print-agent/             # package.json propio
  docs/atria-print-agent-*.md
  apps/web/                      # QZ hoy; Agent en Fase 6
```

Opcional desde raíz: `npm run dev:print-agent` → `npm run dev --prefix atria-print-agent`.

---

## 3. Prerequisites (dev)

- Node.js ≥ 20
- npm 10+
- macOS: CUPS / `lpstat` (incluido)
- Windows 10+: PowerShell + WMI `Win32_Printer`
- **Sin** Visual Studio Build Tools ni libs nativas npm para Fase 3

---

## 4. Comandos

```bash
cd atria-print-agent
npm install
npm run dev          # → http://127.0.0.1:9876
npm test             # unitarios con mocks (sin HW)
npm run typecheck
npm run build && npm start
```

| Script | Comando |
|--------|---------|
| `dev` | `tsx watch src/main.ts` |
| `build` | `tsc -p tsconfig.json` |
| `start` | `node dist/main.js` |
| `typecheck` | `tsc --noEmit` |
| `test` | (ver `package.json` del Agent) |

---

## 5. Constantes (no divergir)

```ts
export const AGENT_NAME = 'Atria Print Agent';
export const DEFAULT_HOST = '127.0.0.1';
export const DEFAULT_PORT = 9876;
```

SPA futura: solo `http://127.0.0.1:9876`.

User-data: `%APPDATA%\AtriaPrintAgent` / `~/Library/Application Support/AtriaPrintAgent`.

---

## 6. Estructura (Fase 3)

```text
src/
  main.ts
  config/
  server/                 # routes: health, printers, printers/:name/status, print* 501
  security/token.ts
  jobs/
  printer/
    printer.interface.ts  # PrinterInfo: name, status, isDefault, source, type?
    commandRunner.ts
    index.ts
    macos/                # lpstat -p/-d/-v · parse EN+ES
    windows/              # Get-CimInstance Win32_Printer
  logging/
assets/atria-logo.png
```

### Comportamiento actual

| API | Resultado |
|-----|-----------|
| `listPrinters()` | Colas reales del SO |
| `getPrinterStatus(name)` | Un `PrinterInfo` o `PrinterError` `PRINTER_NOT_FOUND` |
| `printRaw()` / HTTP print | **No imprime** — HTTP **501** `UNSUPPORTED` |

**Deps impresión:** ninguna nativa npm. Solo `express` + tooling TS.

---

## 7. Probar health / printers

```bash
curl -s http://127.0.0.1:9876/health | jq
curl -s http://127.0.0.1:9876/printers | jq

# Status de cola (encode obligatorio si hay espacios / chars especiales)
curl -s "http://127.0.0.1:9876/printers/$(python3 -c 'import urllib.parse; print(urllib.parse.quote("Xprinter_XP-420B"))')/status" | jq

# Con token:
curl -s -H "X-Atria-Print-Token: $TOKEN" http://127.0.0.1:9876/printers | jq

# Print aún no soportado:
curl -s -X POST http://127.0.0.1:9876/print/raw \
  -H 'Content-Type: application/json' \
  -d '{"printer":"Xprinter_XP-420B","data":"SIZE 50 mm,25 mm\r\n"}' | jq
# → 501 { "error": "UNSUPPORTED", ... }
```

Windows (PowerShell):

```powershell
Invoke-RestMethod http://127.0.0.1:9876/health
Invoke-RestMethod http://127.0.0.1:9876/printers
```

Contrato `PrinterInfo` / respuestas: [`atria-print-agent-architecture.md`](./atria-print-agent-architecture.md) §5.

---

## 8. Relación con L'Scala web

Hasta Fase 6: `apps/web` usa QZ. Para probar Agent en paralelo: `npm run dev` en `atria-print-agent` + curl o cliente fetch experimental.

No modificar generación TSPL en el Agent.

---

## 9. Empaquetado

Scripts Inno/DMG en `packaging/` (Fase 4+). Día a día: `npm run dev`.

---

## 10. Checklist

- [x] `package.json` + `DEFAULT_PORT = 9876`
- [x] config / paths / logger / token
- [x] `main.ts` + Express `/health`
- [x] `GET /printers` + `GET /printers/:name/status` reales (CUPS / Win32)
- [x] Parser macOS EN+ES; Windows PowerShell
- [x] Sin deps nativas npm (Fase 3)
- [x] `POST /print*` → 501
- [x] Logo `assets/atria-logo.png`
- [ ] Print RAW Win (Fase 4) / Mac (Fase 5)
- [ ] Scripts packaging + auto-start
- [ ] Wire SPA (Fase 6)

---

## Relacionados

- [`atria-print-agent-architecture.md`](./atria-print-agent-architecture.md)
- [`atria-print-agent-security.md`](./atria-print-agent-security.md)
- `atria-print-agent/README.md`
- [`qz-tray-analysis.md`](./qz-tray-analysis.md)
