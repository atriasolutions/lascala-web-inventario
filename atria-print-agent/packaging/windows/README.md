# Generar Setup.exe (Windows)

```bash
cd atria-print-agent
npm run pack:win
```

Salida en `packaging/out/`:

- `win-payload/atria-print-agent.cmd`
- `win-payload/runtime/node.exe` + `bundle.cjs` (Node embebido; el usuario no instala Node)
- `AtriaPrintAgent.iss`
- `atria-logo.png`

## Compilar el instalador

1. Instalar [Inno Setup 6](https://jrsoftware.org/isinfo.php) en un PC Windows.
2. `iscc packaging\out\AtriaPrintAgent.iss`
3. Resultado: `packaging/out/AtriaPrintAgent-Setup.exe`

Auto-start: carpeta Inicio del usuario + `HKCU\...\Run` (sesión de usuario, **no** Service).

## SmartScreen

Builds sin Authenticode: “Más información → Ejecutar de todos modos”.
