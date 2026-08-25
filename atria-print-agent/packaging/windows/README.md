# Generar Setup.exe (Windows)

```bash
cd atria-print-agent
npm run pack:win
```

Salida en `packaging/out/`:

- `win-payload/atria-print-agent.cmd`
- `win-payload/runtime/node.exe` + `bundle.cjs` (Node embebido; el usuario no instala Node)
- `win-payload/runtime/node_modules/tray-hook/` + `@phtdacosta/tray-hook-win32-x64/tray-hook.exe` (bandeja)
- `win-payload/runtime/assets/tray-icon.png`
- `AtriaPrintAgent.iss`
- `atria-logo.png`
- `AtriaPrintAgent-windows-pack.zip` (payload + ISS + logo + LEEME)

Si falta el `.exe` nativo de tray-hook, el Agent **sí** escucha en `127.0.0.1:9876` (Detectar en la web puede funcionar), pero no hay ícono junto al reloj. Reempaquetar con `pack:win` actual.

## Compilar el instalador

1. Instalar [Inno Setup 6](https://jrsoftware.org/isinfo.php) en un PC Windows.
2. `iscc packaging\out\AtriaPrintAgent.iss`  
   (o descomprimir el ZIP y ejecutar `iscc AtriaPrintAgent.iss` desde esa carpeta)
3. Resultado: `packaging/out/AtriaPrintAgent-Setup.exe`
4. Desinstalar la versión anterior en la caja, instalar el Setup nuevo, abrir la app y comprobar el ícono + `http://127.0.0.1:9876/health`.

Auto-start: carpeta Inicio del usuario + `HKCU\...\Run` (sesión de usuario, **no** Service).

## SmartScreen

Builds sin Authenticode: “Más información → Ejecutar de todos modos”.
