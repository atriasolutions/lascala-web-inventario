#!/usr/bin/env node
/**
 * Empaqueta Atria Print Agent para macOS (sin Electron).
 *
 * Estrategia: **Node.js oficial embebido** + bundle CJS (esbuild).
 * Justificación: @yao-pkg/pkg no tenía prebuild node20-macos en cache y compilaba
 * desde fuente (~largo / frágil en CI). El usuario boutique sigue sin instalar Node
 * a nivel sistema — el runtime vive dentro del .app (Plan B §12.7 del análisis QZ).
 *
 * Salida: .app + DMG + zip en packaging/out/
 */
import { execFileSync, execSync } from 'node:child_process';
import fs from 'node:fs';
import https from 'node:https';
import os from 'node:os';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { createWriteStream } from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const OUT = path.join(ROOT, 'packaging', 'out');
const CACHE = path.join(ROOT, 'packaging', 'cache');
const APP_NAME = 'Atria Print Agent.app';
const BUNDLE_ID = 'com.atria.print-agent';
const NODE_VERSION = '20.18.1';
const VERSION = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;

function run(cmd, opts = {}) {
  console.log(`$ ${cmd}`);
  execSync(cmd, { cwd: ROOT, stdio: 'inherit', ...opts });
}

function mkdirp(p) {
  fs.mkdirSync(p, { recursive: true });
}

function download(url, dest) {
  return new Promise((resolve, reject) => {
    console.log(`Downloading ${url}`);
    const file = createWriteStream(dest);
    https
      .get(url, (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          file.close();
          fs.unlinkSync(dest);
          download(res.headers.location, dest).then(resolve, reject);
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode} for ${url}`));
          return;
        }
        pipeline(res, file).then(resolve, reject);
      })
      .on('error', reject);
  });
}

async function ensureNodeTarball(arch) {
  mkdirp(CACHE);
  const name = `node-v${NODE_VERSION}-darwin-${arch}`;
  const tar = path.join(CACHE, `${name}.tar.gz`);
  const url = `https://nodejs.org/dist/v${NODE_VERSION}/${name}.tar.gz`;
  if (!fs.existsSync(tar) || fs.statSync(tar).size < 1_000_000) {
    await download(url, tar);
  }
  const extractDir = path.join(CACHE, name);
  if (!fs.existsSync(path.join(extractDir, 'bin', 'node'))) {
    fs.rmSync(extractDir, { recursive: true, force: true });
    run(`tar -xzf "${tar}" -C "${CACHE}"`);
  }
  return extractDir;
}

function buildBundle() {
  run('npm run build');
  mkdirp(OUT);
  // CJS: Express y deps CJS necesitan require(). ESM bundle rompía con
  // "Dynamic require of path is not supported" y la app moría al abrir.
  // tray-hook (ESM) queda external y se carga con import() dinámico.
  run(
    'npx esbuild dist/main.js --bundle --platform=node --target=node20 --format=cjs --external:tray-hook --outfile=packaging/out/bundle.cjs --legal-comments=none',
  );
}

function copyTrayRuntime(appDir) {
  const nm = path.join(appDir, 'node_modules');
  mkdirp(path.join(nm, '@phtdacosta'));
  execFileSync('cp', ['-R', path.join(ROOT, 'node_modules', 'tray-hook'), path.join(nm, 'tray-hook')]);
  const arch = os.arch() === 'arm64' ? 'arm64' : 'x64';
  const platPkg = `tray-hook-darwin-${arch}`;
  const src = path.join(ROOT, 'node_modules', '@phtdacosta', platPkg);
  if (!fs.existsSync(src)) {
    throw new Error(`Falta ${platPkg}. Ejecuta: npm i && npm i @phtdacosta/${platPkg}`);
  }
  execFileSync('cp', ['-R', src, path.join(nm, '@phtdacosta', platPkg)]);
  mkdirp(path.join(appDir, 'assets'));
  fs.copyFileSync(path.join(ROOT, 'assets', 'tray-icon.png'), path.join(appDir, 'assets', 'tray-icon.png'));
  if (fs.existsSync(path.join(ROOT, 'assets', 'tray-icon@2x.png'))) {
    fs.copyFileSync(
      path.join(ROOT, 'assets', 'tray-icon@2x.png'),
      path.join(appDir, 'assets', 'tray-icon@2x.png'),
    );
  }
  fs.writeFileSync(
    path.join(appDir, 'package.json'),
    JSON.stringify({ name: 'atria-print-agent-runtime', private: true }, null, 2),
  );
}

function assembleApp(nodeDistDir, icns) {
  const appRoot = path.join(OUT, APP_NAME);
  fs.rmSync(appRoot, { recursive: true, force: true });
  const contents = path.join(appRoot, 'Contents');
  const macOS = path.join(contents, 'MacOS');
  const resources = path.join(contents, 'Resources');
  const runtime = path.join(resources, 'runtime');
  const appDir = path.join(runtime, 'app');
  mkdirp(macOS);
  mkdirp(path.join(runtime, 'bin'));
  mkdirp(appDir);

  fs.copyFileSync(path.join(nodeDistDir, 'bin', 'node'), path.join(runtime, 'bin', 'node'));
  fs.chmodSync(path.join(runtime, 'bin', 'node'), 0o755);
  fs.copyFileSync(path.join(OUT, 'bundle.cjs'), path.join(appDir, 'bundle.cjs'));
  copyTrayRuntime(appDir);
  fs.copyFileSync(icns, path.join(resources, 'AppIcon.icns'));
  writeInfoPlist(contents);

  // Solo menubar (LSUIElement=true): sin ícono en el Dock, como Jiggler. Logs a user-data.
  const launcher = `#!/bin/bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export ATRIA_PACKAGED=1
APP_SUPPORT="\${HOME}/Library/Application Support/AtriaPrintAgent"
mkdir -p "\${APP_SUPPORT}/logs"
LOG="\${APP_SUPPORT}/logs/launch.log"
cd "$ROOT/Resources/runtime/app"
exec >>"\${LOG}" 2>&1
echo "---- \$(date -u +%Y-%m-%dT%H:%M:%SZ) start ----"
echo "ROOT=\${ROOT}"
exec "$ROOT/Resources/runtime/bin/node" ./bundle.cjs
`;
  const destBin = path.join(macOS, 'atria-print-agent');
  fs.writeFileSync(destBin, launcher);
  fs.chmodSync(destBin, 0o755);

  return appRoot;
}

function buildIcns() {
  const logo = path.join(ROOT, 'assets', 'atria-logo.png');
  const iconset = path.join(OUT, 'AppIcon.iconset');
  fs.rmSync(iconset, { recursive: true, force: true });
  mkdirp(iconset);
  const map = [
    [16, 'icon_16x16.png'],
    [32, 'icon_16x16@2x.png'],
    [32, 'icon_32x32.png'],
    [64, 'icon_32x32@2x.png'],
    [128, 'icon_128x128.png'],
    [256, 'icon_128x128@2x.png'],
    [256, 'icon_256x256.png'],
    [512, 'icon_256x256@2x.png'],
    [512, 'icon_512x512.png'],
    [1024, 'icon_512x512@2x.png'],
  ];
  for (const [px, name] of map) {
    execFileSync('sips', ['-z', String(px), String(px), logo, '--out', path.join(iconset, name)], {
      stdio: 'pipe',
    });
  }
  const icns = path.join(OUT, 'AppIcon.icns');
  execFileSync('iconutil', ['-c', 'icns', iconset, '-o', icns], { stdio: 'inherit' });
  return icns;
}

function writeInfoPlist(appContents) {
  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key>
  <string>Atria Print Agent</string>
  <key>CFBundleDisplayName</key>
  <string>Atria Print Agent</string>
  <key>CFBundleIdentifier</key>
  <string>${BUNDLE_ID}</string>
  <key>CFBundleVersion</key>
  <string>${VERSION}</string>
  <key>CFBundleShortVersionString</key>
  <string>${VERSION}</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleExecutable</key>
  <string>atria-print-agent</string>
  <key>CFBundleIconFile</key>
  <string>AppIcon</string>
  <key>LSMinimumSystemVersion</key>
  <string>12.0</string>
  <key>NSHighResolutionCapable</key>
  <true/>
  <key>LSUIElement</key>
  <true/>
  <key>NSHumanReadableCopyright</key>
  <string>Copyright © Atria Solutions SpA</string>
</dict>
</plist>
`;
  fs.writeFileSync(path.join(appContents, 'Info.plist'), plist);
}

function makeDmg(appRoot) {
  const stage = path.join(OUT, 'dmg-stage');
  fs.rmSync(stage, { recursive: true, force: true });
  mkdirp(stage);
  execFileSync('cp', ['-R', appRoot, path.join(stage, APP_NAME)]);
  execFileSync('ln', ['-s', '/Applications', path.join(stage, 'Applications')]);
  fs.writeFileSync(
    path.join(stage, 'LEEME.txt'),
    `Atria Print Agent — instalación macOS
=====================================

1. Arrastra "Atria Print Agent" a la carpeta Applications.
2. Abre Applications → Atria Print Agent
   (clic derecho → Abrir la primera vez si Gatekeeper avisa).
3. No aparece en el Dock: solo un ícono Atria en la barra de menú (arriba).
   Menú: Estado · Encender · Apagar · Abrir estado · Abrir registros · Salir.
   Apagar = deja de escuchar en :9876 (el ícono sigue).
   Salir = cierra el Agent por completo (quita el ícono).
4. El Agent se registra para arrancar al iniciar sesión (LaunchAgent).
5. Health: http://127.0.0.1:9876/health

Gatekeeper (app sin notarizar todavía):
  Ajustes del Sistema → Privacidad y seguridad → "Abrir de todas formas".

Conflicto con desarrollo (npm run dev del Agent): solo uno puede usar el puerto 9876.
  launchctl bootout gui/$(id -u)/com.atria.print-agent

Atria Solutions SpA · Boutique L'Scala
`,
  );
  const dmg = path.join(OUT, 'AtriaPrintAgent.dmg');
  fs.rmSync(dmg, { force: true });
  execFileSync(
    'hdiutil',
    ['create', '-volname', 'Atria Print Agent', '-srcfolder', stage, '-ov', '-format', 'UDZO', dmg],
    { stdio: 'inherit' },
  );
  return dmg;
}

function makeZip(appRoot) {
  const zip = path.join(OUT, 'AtriaPrintAgent-mac.zip');
  fs.rmSync(zip, { force: true });
  execFileSync('ditto', ['-c', '-k', '--sequesterRsrc', '--keepParent', appRoot, zip], {
    stdio: 'inherit',
  });
  return zip;
}

async function main() {
  console.log('=== pack:mac Atria Print Agent (Node embebido) ===');
  const arch = os.arch() === 'arm64' ? 'arm64' : 'x64';
  fs.rmSync(OUT, { recursive: true, force: true });
  mkdirp(OUT);
  buildBundle();
  const nodeDist = await ensureNodeTarball(arch);
  const icns = buildIcns();
  const appRoot = assembleApp(nodeDist, icns);
  const dmg = makeDmg(appRoot);
  const zip = makeZip(appRoot);
  console.log('\nArtefactos:');
  console.log(`  .app  ${appRoot}`);
  console.log(`  DMG   ${dmg}`);
  console.log(`  ZIP   ${zip}`);
  console.log(`  arch  ${arch} · Node v${NODE_VERSION} embebido`);
  console.log('\nInstalar: abrir DMG → Applications → Abrir la app una vez.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
