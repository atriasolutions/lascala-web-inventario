import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { logger } from '../logging/logger.js';

export const LAUNCH_AGENT_LABEL = 'com.atria.print-agent';

function launchAgentsDir(): string {
  return path.join(os.homedir(), 'Library', 'LaunchAgents');
}

export function launchAgentPlistPath(): string {
  return path.join(launchAgentsDir(), `${LAUNCH_AGENT_LABEL}.plist`);
}

/** True cuando corre el binario empaquetado o desde el .app. */
export function isPackagedRuntime(): boolean {
  const proc = process as NodeJS.Process & { pkg?: unknown };
  if (proc.pkg) return true;
  if (process.env.ATRIA_PACKAGED === '1') return true;
  return process.execPath.includes('Atria Print Agent.app');
}

/**
 * Ruta al launcher bash dentro del .app (no al node embebido).
 * LaunchAgent debe ejecutar este script.
 */
export function resolvePackagedLauncherPath(): string | null {
  const marker = 'Atria Print Agent.app';
  const idx = process.execPath.indexOf(marker);
  if (idx < 0) return null;
  const appRoot = process.execPath.slice(0, idx + marker.length);
  const launcher = path.join(appRoot, 'Contents', 'MacOS', 'atria-print-agent');
  return fs.existsSync(launcher) ? launcher : null;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function buildLaunchAgentPlist(execPath: string, logDir: string): string {
  const stdout = path.join(logDir, 'launchd-stdout.log');
  const stderr = path.join(logDir, 'launchd-stderr.log');
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LAUNCH_AGENT_LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${escapeXml(execPath)}</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <dict>
    <key>SuccessfulExit</key>
    <false/>
  </dict>
  <key>WorkingDirectory</key>
  <string>${escapeXml(path.dirname(execPath))}</string>
  <key>StandardOutPath</key>
  <string>${escapeXml(stdout)}</string>
  <key>StandardErrorPath</key>
  <string>${escapeXml(stderr)}</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>ATRIA_PACKAGED</key>
    <string>1</string>
  </dict>
</dict>
</plist>
`;
}

/** Quita el LaunchAgent de la sesión (p. ej. al elegir Salir en el tray). */
export function unloadMacLaunchAgent(): void {
  if (process.platform !== 'darwin') return;
  const uid = typeof process.getuid === 'function' ? process.getuid() : undefined;
  const domain = uid != null ? `gui/${uid}` : 'gui';
  try {
    execFileSync('launchctl', ['bootout', `${domain}/${LAUNCH_AGENT_LABEL}`], { stdio: 'ignore' });
    logger.info('launchagent.unloaded', { label: LAUNCH_AGENT_LABEL });
  } catch {
    try {
      execFileSync('launchctl', ['unload', '-w', launchAgentPlistPath()], { stdio: 'ignore' });
      logger.info('launchagent.unloaded_legacy', { label: LAUNCH_AGENT_LABEL });
    } catch (err) {
      logger.debug('launchagent.unload_noop', { err: String(err) });
    }
  }
}

/**
 * Escribe e (re)carga el LaunchAgent del usuario.
 * No usa sudo. Conflicto con `npm run dev`: ambos usan :9876 — unload antes de dev.
 * KeepAlive solo reintenta si el proceso sale con error (Salir limpio no lo resuscita).
 */
export function ensureMacLaunchAgent(execPath: string, logDir: string): void {
  if (process.platform !== 'darwin') return;
  fs.mkdirSync(launchAgentsDir(), { recursive: true });
  fs.mkdirSync(logDir, { recursive: true });

  const plistPath = launchAgentPlistPath();
  const contents = buildLaunchAgentPlist(execPath, logDir);
  const prev = fs.existsSync(plistPath) ? fs.readFileSync(plistPath, 'utf8') : '';
  if (prev !== contents) {
    fs.writeFileSync(plistPath, contents, 'utf8');
    logger.info('launchagent.written', { plistPath, execPath });
  }

  const uid = typeof process.getuid === 'function' ? process.getuid() : undefined;
  const domain = uid != null ? `gui/${uid}` : 'gui';
  try {
    execFileSync('launchctl', ['bootout', `${domain}/${LAUNCH_AGENT_LABEL}`], { stdio: 'ignore' });
  } catch {
    // no estaba cargado
  }
  try {
    execFileSync('launchctl', ['bootstrap', domain, plistPath], { stdio: 'ignore' });
    logger.info('launchagent.loaded', { label: LAUNCH_AGENT_LABEL });
  } catch (err) {
    try {
      execFileSync('launchctl', ['load', '-w', plistPath], { stdio: 'ignore' });
      logger.info('launchagent.loaded_legacy', { label: LAUNCH_AGENT_LABEL });
    } catch {
      logger.warn('launchagent.load_failed', { err: String(err), plistPath });
    }
  }
}
