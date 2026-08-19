# Atria Print Agent — Instalación (usuario final)

**Cliente:** Boutique L'Scala · **Proveedor:** Atria Solutions SpA  
**Audiencia:** dueña / vendedoras / soporte en piso  
**Requisito duro:** instalable + auto-start; **sin** instalar Node.js; **sin** abrir terminal tras reiniciar.

Detalle técnico de empaquetado: [`qz-tray-analysis.md`](./qz-tray-analysis.md) §12.7 · arquitectura: [`atria-print-agent-architecture.md`](./atria-print-agent-architecture.md).

Código / scripts: `atria-print-agent/packaging/`.

---

## 1. Qué recibe la boutique

| Plataforma | Archivo | Resultado |
|------------|---------|-----------|
| Windows | `AtriaPrintAgent-Setup.exe` | App en `%LOCALAPPDATA%\Atria\PrintAgent` + auto-start al login |
| macOS | `AtriaPrintAgent.dmg` (o `AtriaPrintAgent-mac.zip`) | `Atria Print Agent.app` en Applications + LaunchAgent |

Tras instalar (y reiniciar o volver a entrar a la sesión), el puente escucha en:

```text
http://127.0.0.1:9876
```

L'Scala (navegador en el mismo PC) detecta el Agent en **Admin → Equipo** (prefs de impresoras).

---

## 2. Experiencia Windows (usuario)

1. Ejecutar `AtriaPrintAgent-Setup.exe` (asistente Inno Setup).
2. Aceptar ubicación sugerida (`%LOCALAPPDATA%\Atria\PrintAgent`).
3. Dejar marcada la opción de iniciar al iniciar sesión.
4. Si SmartScreen avisa (builds sin firma): “Más información → Ejecutar de todos modos”.
5. Reiniciar el PC o cerrar sesión y volver a entrar.
6. Abrir en el navegador: `http://127.0.0.1:9876/health` → debe verse `"ok": true`.
7. Abrir L'Scala → verificar puente **Conectado**.

**No** se pide instalar Node, Java ni QZ Tray para el Agent.

Desinstalación: Configuración → Apps → Atria Print Agent (quita Run key / acceso Inicio y el exe).

---

## 3. Experiencia macOS (usuario) — prioridad

### Instalar

1. Abrir `AtriaPrintAgent.dmg`.
2. Arrastrar **Atria Print Agent** a la carpeta **Applications**.
3. Abrir **Applications → Atria Print Agent**.
   - Si Gatekeeper bloquea (app **sin notarizar** todavía):
     - clic derecho → **Abrir** → Abrir, **o**
     - Ajustes del Sistema → Privacidad y seguridad → **Abrir de todas formas**.
4. Verás **solo** un **ícono Atria en la barra de menú** (arriba a la derecha).  
   **No** aparece en el Dock (app tipo agente / `LSUIElement`, como Jiggler).  
   Si quedó un ícono viejo en el Dock de una versión anterior: clic derecho → Opciones → **Quitar del Dock**.  
   Menú del tray:
   - **Estado:** escuchando / detenido  
   - **Encender** / **Apagar** — inicia o detiene el servidor local (`:9876`). Apagar **no** quita el ícono.  
   - **Abrir estado (health)** / **Abrir registros**  
   - **Salir** — cierra el Agent por completo (quita el ícono). Distinto de Apagar.  
     Tras Salir, vuelve a abrir la app desde Applications (o al iniciar sesión, si el LaunchAgent sigue registrado).
5. Al primer arranque **desde `/Applications`** el Agent escribe el LaunchAgent  
   `~/Library/LaunchAgents/com.atria.print-agent.plist` (`RunAtLoad`; KeepAlive solo si sale con error).  
   (Si abres el `.app` solo desde el DMG/packaging sin copiar a Applications, no registra auto-start.)
6. Reiniciar o cerrar sesión y volver a entrar.
7. Comprobar: clic en el ícono → Abrir estado, o Safari/Chrome en  
   `http://127.0.0.1:9876/health`.

Alternativa sin DMG: descomprimir `AtriaPrintAgent-mac.zip` y copiar el `.app` a Applications (mismos pasos 3–6).

### Logs

`~/Library/Application Support/AtriaPrintAgent/logs/`

### Quitar

```bash
launchctl bootout gui/$(id -u)/com.atria.print-agent
rm -f ~/Library/LaunchAgents/com.atria.print-agent.plist
rm -rf "/Applications/Atria Print Agent.app"
```

---

## 4. Criterios de aceptación del instalador

Gate de producto (obligatorio):

1. PC **sin** Node.js / Git / toolchain de desarrollo.
2. Instalar con Setup.exe o DMG sin pasos de desarrollador.
3. Reiniciar (o logout/login).
4. **Sin** abrir terminal ni lanzar el Agent a mano:  
   `GET http://127.0.0.1:9876/health` → `{ "ok": true, ... }`.
5. SPA muestra puente conectado y puede listar impresoras.
6. (Fase 4+) Imprimir una etiqueta TSPL a la cola configurada.
7. Desinstalar deja de responder en `:9876`.

---

## 5. Cómo genera el instalable el desarrollador (Atria)

Requisitos: Node ≥20, macOS para `pack:mac` (hdiutil / iconutil).

```bash
cd atria-print-agent
npm install
npm run pack:mac    # → packaging/out/AtriaPrintAgent.dmg (+ .app + zip)
npm run pack:win    # → packaging/out/atria-print-agent.exe (+ .iss)
```

### macOS — cadena

1. `tsc` → `esbuild` (bundle CJS único; **sin Electron**).
2. Descarga **Node.js 20 LTS oficial** (darwin x64/arm64) y lo embebe en el `.app`  
   (Plan B §12.7: el usuario **no** instala Node de sistema; el runtime vive en  
   `Atria Print Agent.app/Contents/Resources/runtime/`).  
   *Nota:* se evitó `@yao-pkg/pkg` en esta fase porque el prebuild node20-macos no estaba en cache y compilaba desde fuente.
3. Ensambla `Atria Print Agent.app` (**`LSUIElement=true`**: solo menubar, sin Dock) + icono `.icns` desde `assets/atria-logo.png`; copia `tray-icon*.png` al runtime.
4. `hdiutil` → `AtriaPrintAgent.dmg`; `ditto` → `AtriaPrintAgent-mac.zip`.

Rutas de salida:

```text
atria-print-agent/packaging/out/
  Atria Print Agent.app/
  AtriaPrintAgent.dmg
  AtriaPrintAgent-mac.zip
  atria-print-agent-macos-<arch>
```

### Windows — cadena

1. `npm run pack:win` descarga Node 20 win-x64 oficial, arma `packaging/out/win-payload/`  
   (`atria-print-agent.cmd` + `runtime/node.exe` + `bundle.cjs`).
2. En un PC **Windows** con Inno Setup 6:  
   `iscc packaging\out\AtriaPrintAgent.iss`  
   → `AtriaPrintAgent-Setup.exe`.  
   Detalle: [`atria-print-agent/packaging/windows/README.md`](../atria-print-agent/packaging/windows/README.md).

Auto-start Win: carpeta **Inicio** del usuario + `HKCU\Software\Microsoft\Windows\CurrentVersion\Run` (sesión de usuario, **no** Windows Service).

### Conflicto con `npm run dev`

Solo **un** proceso puede escuchar `127.0.0.1:9876`.

| Situación | Acción |
|-----------|--------|
| Quieres `npm run dev` con LaunchAgent instalado | `launchctl bootout gui/$(id -u)/com.atria.print-agent` |
| Quieres el .app / LaunchAgent | cierra el `npm run dev` del Agent |

El LaunchAgent de producto apunta al binario en `/Applications/...`; no usa el tree del monorepo.

### Gatekeeper / firma (estado actual)

- **macOS:** builds internos **sin** Developer ID / notarización. Documentar bypass “Abrir de todas formas”.
- **Windows:** sin Authenticode → SmartScreen interim.
- Firma real = pendiente certificado Atria (no bloquea el artefacto de lab).

---

## 6. Logo Atria — assets y usos

Isotipo Atria Print Agent (letra “A” azul metálica). **No** es el wordmark Atria genérico ni el logo L'Scala.

### Ubicaciones en repo

| Ruta | Uso |
|------|-----|
| `atria-print-agent/assets/atria-logo.png` | **Canónico** — Dock / `.icns` / DMG / banner Inno / docs |
| `atria-print-agent/assets/atria-logo-tray-source.png` | Derivado: mismo isotipo con fondo transparente (master del tray) |
| `atria-print-agent/assets/tray-icon.png` | Menu bar 16×16 (alpha) |
| `atria-print-agent/assets/tray-icon@2x.png` | Menu bar 32×32 (Retina) |
| `docs/brand/atria-logo.png` | Copia del canónico para documentación |

### Verificación técnica

- Canónico: **RGBA** 500×500. En preview suele verse “fondo negro”, pero el archivo **ya trae alpha** (no hay negro opaco de fondo); el Dock/macOS aplica la máscara redondeada del sistema detrás del isotipo.
- Tray: recorte + resize a 16/32 desde el master transparente (`atria-logo-tray-source.png`). A 16 px el detalle metálico se pierde y se ve un “A” azul simplificado. Contraste aceptable en barra clara/oscura; no es template monochrome (`NSImage.isTemplate`).
- `pack:mac` regenera `AppIcon.icns` desde el canónico y embebe los `tray-icon*`.

### Mapa de usos

| Superficie | Asset | Notas |
|------------|-------|-------|
| Icono `.app` / Dock | `AppIcon.icns` | Desde `atria-logo.png` |
| DMG / zip | mismo `.app` | Arte regenerado en cada `pack:mac` |
| Banner Inno | `atria-logo.png` | Copiado a `packaging/out/` |
| Tray menu bar | `tray-icon.png` / `@2x` | Transparencia; no usar el PNG negro crudo |

Marca L'Scala (fucsia `#E6007E`) sigue en la SPA; el Agent lleva **identidad Atria**.

---

## 7. Soporte rápido (“¿está corriendo?”)

1. En L'Scala → Admin → Equipo → estado del puente.
2. Navegador del mismo PC: `http://127.0.0.1:9876/health`.
3. Logs en user-data (ruta §3).

No pedir a la usuaria que ejecute `node` ni comandos npm.

---

## 8. Relación con QZ Tray (transición)

- Mientras no haya cutover (Fase 8), lab puede tener QZ y Agent; la SPA solo usará uno.
- Tras cutover: desinstalar QZ Tray; el Agent es el único puente.

---

## Relacionados

- [`atria-print-agent-architecture.md`](./atria-print-agent-architecture.md)
- [`atria-print-agent-security.md`](./atria-print-agent-security.md)
- [`atria-print-agent-development.md`](./atria-print-agent-development.md)
- [`docs/brand.md`](./brand.md)
