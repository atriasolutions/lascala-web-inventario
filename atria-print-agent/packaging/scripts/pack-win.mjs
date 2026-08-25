#!/usr/bin/env node
/**
 * Empaqueta Windows: Node embebido + bundle CJS + tray-hook nativo + layout Inno.
 *
 * Igual que pack-mac: tray-hook queda **external** (no en el bundle) y se copia
 * `node_modules/tray-hook` + `@phtdacosta/tray-hook-win32-x64` (tray-hook.exe)
 * junto a bundle.cjs. Sin eso el Agent arranca HTTP pero falla el tray.
 *
 * En Windows: iscc packaging\out\AtriaPrintAgent.iss → Setup.exe
 */
import { execFileSync, execSync } from 'node:child_process';
import fs from 'node:fs';
import https from 'node:https';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { createWriteStream } from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const OUT = path.join(ROOT, 'packaging', 'out');
const CACHE = path.join(ROOT, 'packaging', 'cache');
const NODE_VERSION = '20.18.1';
const WIN_TRAY_PKG = '@phtdacosta/tray-hook-win32-x64';

function run(cmd) {
  console.log(`$ ${cmd}`);
  execSync(cmd, { cwd: ROOT, stdio: 'inherit' });
}

function mkdirp(p) {
  fs.mkdirSync(p, { recursive: true });
}

function cpRecursive(src, dest) {
  fs.cpSync(src, dest, { recursive: true });
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
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }
        pipeline(res, file).then(resolve, reject);
      })
      .on('error', reject);
  });
}

async function ensureNodeWin() {
  mkdirp(CACHE);
  const name = `node-v${NODE_VERSION}-win-x64`;
  const zip = path.join(CACHE, `${name}.zip`);
  const url = `https://nodejs.org/dist/v${NODE_VERSION}/${name}.zip`;
  if (!fs.existsSync(zip) || fs.statSync(zip).size < 1_000_000) {
    await download(url, zip);
  }
  const extractDir = path.join(CACHE, name);
  if (!fs.existsSync(path.join(extractDir, 'node.exe'))) {
    fs.rmSync(extractDir, { recursive: true, force: true });
    try {
      execFileSync('unzip', ['-q', '-o', zip, '-d', CACHE], { stdio: 'inherit' });
    } catch {
      run(`unzip -q -o "${zip}" -d "${CACHE}"`);
    }
  }
  return extractDir;
}

/** En Mac/Linux no se instala el optional win32; hay que pedirlo para el payload. */
function ensureWinTrayBinary() {
  const pkgDir = path.join(ROOT, 'node_modules', '@phtdacosta', 'tray-hook-win32-x64');
  const exe = path.join(pkgDir, 'tray-hook.exe');
  if (fs.existsSync(exe)) return pkgDir;
  console.log(`Instalando ${WIN_TRAY_PKG} (binario nativo Windows; --force en Mac)…`);
  // El paquete declara os=win32; en darwin npm rechaza sin --force.
  run(
    `npm install --no-save --no-audit --no-fund --force ${WIN_TRAY_PKG}@1.1.1`,
  );
  if (!fs.existsSync(exe)) {
    // Fallback: npm pack + extract (por si --force no dejó el .exe).
    mkdirp(CACHE);
    run(`npm pack ${WIN_TRAY_PKG}@1.1.1 --pack-destination "${CACHE}"`);
    const packed = fs.readdirSync(CACHE).find((f) => f.startsWith('phtdacosta-tray-hook-win32-x64'));
    if (!packed) {
      throw new Error(`npm pack no generó tarball de ${WIN_TRAY_PKG}`);
    }
    const extractTo = path.join(CACHE, 'tray-hook-win32-x64-extract');
    fs.rmSync(extractTo, { recursive: true, force: true });
    mkdirp(extractTo);
    execFileSync('tar', ['-xzf', path.join(CACHE, packed), '-C', extractTo], { stdio: 'inherit' });
    const fromPkg = path.join(extractTo, 'package');
    mkdirp(path.dirname(pkgDir));
    fs.rmSync(pkgDir, { recursive: true, force: true });
    cpRecursive(fromPkg, pkgDir);
  }
  if (!fs.existsSync(exe)) {
    throw new Error(
      `Falta ${WIN_TRAY_PKG}/tray-hook.exe tras npm install. Revisa red / registry.`,
    );
  }
  return pkgDir;
}

function copyTrayRuntime(runtimeDir) {
  const nm = path.join(runtimeDir, 'node_modules');
  mkdirp(path.join(nm, '@phtdacosta'));
  const traySrc = path.join(ROOT, 'node_modules', 'tray-hook');
  if (!fs.existsSync(traySrc)) {
    throw new Error('Falta node_modules/tray-hook. Ejecuta npm i en atria-print-agent.');
  }
  cpRecursive(traySrc, path.join(nm, 'tray-hook'));
  const winPkgSrc = ensureWinTrayBinary();
  cpRecursive(winPkgSrc, path.join(nm, '@phtdacosta', 'tray-hook-win32-x64'));

  const assetsDir = path.join(runtimeDir, 'assets');
  mkdirp(assetsDir);
  fs.copyFileSync(path.join(ROOT, 'assets', 'tray-icon.png'), path.join(assetsDir, 'tray-icon.png'));
  const icon2x = path.join(ROOT, 'assets', 'tray-icon@2x.png');
  if (fs.existsSync(icon2x)) {
    fs.copyFileSync(icon2x, path.join(assetsDir, 'tray-icon@2x.png'));
  }

  fs.writeFileSync(
    path.join(runtimeDir, 'package.json'),
    JSON.stringify({ name: 'atria-print-agent-runtime', private: true, type: 'commonjs' }, null, 2),
  );
}

function writeLeeme(winPayload) {
  const text = `Atria Print Agent — Windows
=============================

1) Generar payload (en Mac o PC de desarrollo):
   cd atria-print-agent
   npm run pack:win

2) En Windows con Inno Setup 6:
   iscc packaging\\out\\AtriaPrintAgent.iss
   → packaging\\out\\AtriaPrintAgent-Setup.exe

3) Instalar el Setup.exe en la caja, abrir Atria Print Agent.
   Debe aparecer el ícono junto al reloj. HTTP: http://127.0.0.1:9876/health

Notas:
- El Agent escucha solo 127.0.0.1:9876 en ESTE PC (no en la nube).
- Si el tray no aparece pero Detectar en inventario.lscala.cl funciona, el
  servidor sigue activo; reinstala con un pack:win que incluya tray-hook.exe.
- Sin Authenticode: SmartScreen → Más información → Ejecutar de todos modos.
`;
  fs.writeFileSync(path.join(winPayload, 'LEEME.txt'), text);
  fs.writeFileSync(path.join(OUT, 'LEEME-windows.txt'), text);
}

function zipWindowsPack(winPayload) {
  const zipPath = path.join(OUT, 'AtriaPrintAgent-windows-pack.zip');
  fs.rmSync(zipPath, { force: true });
  // Incluye payload + ISS + logo para llevar a un PC Windows y correr iscc.
  const files = [
    'win-payload',
    'AtriaPrintAgent.iss',
    'atria-logo.png',
    'LEEME-windows.txt',
  ];
  for (const f of files) {
    if (!fs.existsSync(path.join(OUT, f)) && f !== 'win-payload') {
      throw new Error(`Falta packaging/out/${f} antes del zip`);
    }
  }
  // ditto/zip from OUT so paths inside zip are clean
  run(
    `cd packaging/out && zip -r -q AtriaPrintAgent-windows-pack.zip win-payload AtriaPrintAgent.iss atria-logo.png LEEME-windows.txt`,
  );
  console.log(`ZIP  ${zipPath}`);
}

async function main() {
  console.log('=== pack:win Atria Print Agent (Node embebido + tray-hook) ===');
  mkdirp(OUT);
  run('npm run build');
  // tray-hook external: el .exe nativo no entra en el bundle (igual que pack-mac).
  run(
    'npx esbuild dist/main.js --bundle --platform=node --target=node20 --format=cjs --external:tray-hook --outfile=packaging/out/bundle.cjs --legal-comments=none',
  );

  const nodeDir = await ensureNodeWin();
  const winPayload = path.join(OUT, 'win-payload');
  fs.rmSync(winPayload, { recursive: true, force: true });
  const runtime = path.join(winPayload, 'runtime');
  mkdirp(runtime);
  fs.copyFileSync(path.join(nodeDir, 'node.exe'), path.join(runtime, 'node.exe'));
  fs.copyFileSync(path.join(OUT, 'bundle.cjs'), path.join(runtime, 'bundle.cjs'));
  copyTrayRuntime(runtime);

  // cwd = runtime para que import('tray-hook') resuelva node_modules locales.
  fs.writeFileSync(
    path.join(winPayload, 'atria-print-agent.cmd'),
    [
      '@echo off',
      'set ATRIA_PACKAGED=1',
      'cd /d "%~dp0runtime"',
      '"%~dp0runtime\\node.exe" "%~dp0runtime\\bundle.cjs"',
      '',
    ].join('\r\n'),
  );

  fs.copyFileSync(path.join(ROOT, 'assets', 'atria-logo.png'), path.join(OUT, 'atria-logo.png'));
  fs.copyFileSync(
    path.join(ROOT, 'packaging', 'windows', 'AtriaPrintAgent.iss'),
    path.join(OUT, 'AtriaPrintAgent.iss'),
  );
  writeLeeme(winPayload);
  zipWindowsPack(winPayload);

  const exe = path.join(
    runtime,
    'node_modules',
    '@phtdacosta',
    'tray-hook-win32-x64',
    'tray-hook.exe',
  );
  if (!fs.existsSync(exe)) {
    throw new Error(`Payload incompleto: no está ${exe}`);
  }

  console.log('\nArtefactos Windows:');
  console.log(`  payload  ${winPayload}`);
  console.log(`  tray exe ${exe}`);
  console.log(`  ISS      ${path.join(OUT, 'AtriaPrintAgent.iss')}`);
  console.log(`  zip      ${path.join(OUT, 'AtriaPrintAgent-windows-pack.zip')}`);
  console.log('\nEn Windows con Inno Setup 6:');
  console.log('  iscc packaging\\out\\AtriaPrintAgent.iss');
  console.log('  (o descomprimir el ZIP y: iscc AtriaPrintAgent.iss)');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
