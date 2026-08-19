import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const APP_DIR_NAME = 'AtriaPrintAgent';

/** Carpeta de datos del usuario (sin PII). Win: %APPDATA%, macOS: ~/Library/Application Support. */
export function getUserDataDir(): string {
  const home = os.homedir();
  if (process.platform === 'win32') {
    const appData = process.env.APPDATA || path.join(home, 'AppData', 'Roaming');
    return path.join(appData, APP_DIR_NAME);
  }
  if (process.platform === 'darwin') {
    return path.join(home, 'Library', 'Application Support', APP_DIR_NAME);
  }
  return path.join(home, '.config', APP_DIR_NAME);
}

export function ensureUserDataDir(): string {
  const dir = getUserDataDir();
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function getConfigPath(): string {
  return path.join(ensureUserDataDir(), 'config.json');
}

export function getLogDir(): string {
  const dir = path.join(ensureUserDataDir(), 'logs');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}
