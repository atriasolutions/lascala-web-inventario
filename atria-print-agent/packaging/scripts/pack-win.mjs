#!/usr/bin/env node
/**
 * Empaqueta Windows: Node embebido + bundle CJS + layout para Inno Setup.
 * (Misma justificación que pack-mac: evitar compile-from-source de pkg.)
 *
 * En Windows: iscc packaging\out\AtriaPrintAgent.iss → Setup.exe
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import https from 'node:https';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { createWriteStream } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createGunzip } from 'node:zlib';
import { execFileSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const OUT = path.join(ROOT, 'packaging', 'out');
const CACHE = path.join(ROOT, 'packaging', 'cache');
const NODE_VERSION = '20.18.1';

function run(cmd) {
  console.log(`$ ${cmd}`);
  execSync(cmd, { cwd: ROOT, stdio: 'inherit' });
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
  fs.mkdirSync(CACHE, { recursive: true });
  const name = `node-v${NODE_VERSION}-win-x64`;
  const zip = path.join(CACHE, `${name}.zip`);
  const url = `https://nodejs.org/dist/v${NODE_VERSION}/${name}.zip`;
  if (!fs.existsSync(zip) || fs.statSync(zip).size < 1_000_000) {
    await download(url, zip);
  }
  const extractDir = path.join(CACHE, name);
  if (!fs.existsSync(path.join(extractDir, 'node.exe'))) {
    fs.rmSync(extractDir, { recursive: true, force: true });
    // unzip via ditto on macOS, Expand-Archive on win — use Node unzip via `unzip` CLI
    try {
      execFileSync('unzip', ['-q', '-o', zip, '-d', CACHE], { stdio: 'inherit' });
    } catch {
      run(`unzip -q -o "${zip}" -d "${CACHE}"`);
    }
  }
  return extractDir;
}

async function main() {
  console.log('=== pack:win Atria Print Agent (Node embebido) ===');
  fs.mkdirSync(OUT, { recursive: true });
  run('npm run build');
  run(
    'npx esbuild dist/main.js --bundle --platform=node --target=node20 --format=cjs --outfile=packaging/out/bundle.cjs --legal-comments=none',
  );
  const nodeDir = await ensureNodeWin();
  const winPayload = path.join(OUT, 'win-payload');
  fs.rmSync(winPayload, { recursive: true, force: true });
  fs.mkdirSync(path.join(winPayload, 'runtime'), { recursive: true });
  fs.copyFileSync(path.join(nodeDir, 'node.exe'), path.join(winPayload, 'runtime', 'node.exe'));
  fs.copyFileSync(path.join(OUT, 'bundle.cjs'), path.join(winPayload, 'runtime', 'bundle.cjs'));
  // Launcher cmd + stub bat that Inno will shortcut
  fs.writeFileSync(
    path.join(winPayload, 'atria-print-agent.cmd'),
    `@echo off\r\nset ATRIA_PACKAGED=1\r\n"%~dp0runtime\\node.exe" "%~dp0runtime\\bundle.cjs"\r\n`,
  );
  // Placeholder exe name for ISS: copy cmd as note — Inno launches .cmd
  // Also provide atria-print-agent.exe as a renamed approach won't work for cmd.
  // Update ISS to launch atria-print-agent.cmd
  fs.copyFileSync(
    path.join(ROOT, 'assets', 'atria-logo.png'),
    path.join(OUT, 'atria-logo.png'),
  );
  fs.copyFileSync(
    path.join(ROOT, 'packaging', 'windows', 'AtriaPrintAgent.iss'),
    path.join(OUT, 'AtriaPrintAgent.iss'),
  );

  console.log('\nArtefactos Windows:');
  console.log(`  payload  ${winPayload}`);
  console.log(`  ISS      ${path.join(OUT, 'AtriaPrintAgent.iss')}`);
  console.log('\nEn Windows con Inno Setup 6:');
  console.log('  iscc packaging\\out\\AtriaPrintAgent.iss');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
