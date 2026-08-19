import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { AGENT_NAME, AGENT_VERSION } from '../config/index.js';
import { logger } from '../logging/logger.js';

const execFileAsync = promisify(execFile);

export type StatusTrayHandle = {
  stop: () => Promise<void>;
  /** Refresca títulos Encender/Apagar según el HTTP. */
  refresh: () => Promise<void>;
};

export type StatusTrayControls = {
  port: number;
  logDir: string;
  isListening: () => boolean;
  /** Encender: volver a escuchar en el puerto. */
  onStart: () => Promise<void>;
  /** Apagar: dejar de escuchar; el proceso y el ícono siguen. */
  onStop: () => Promise<void>;
  /**
   * Salir: cierra el Agent por completo (quita ícono).
   * Distinto de Apagar: no deja el tray vivo.
   */
  onQuit: () => void | Promise<void>;
};

function resolveTrayIconPath(): string | null {
  const candidates = [
    path.join(process.cwd(), 'assets', 'tray-icon.png'),
    path.join(process.cwd(), 'atria-print-agent', 'assets', 'tray-icon.png'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

async function openUrl(url: string): Promise<void> {
  if (process.platform === 'darwin') {
    await execFileAsync('open', [url]);
    return;
  }
  if (process.platform === 'win32') {
    await execFileAsync('cmd', ['/c', 'start', '', url]);
    return;
  }
  await execFileAsync('xdg-open', [url]);
}

async function openPath(dir: string): Promise<void> {
  if (process.platform === 'darwin') {
    await execFileAsync('open', [dir]);
    return;
  }
  if (process.platform === 'win32') {
    await execFileAsync('explorer', [dir]);
    return;
  }
  await execFileAsync('xdg-open', [dir]);
}

async function notifyOnce(message: string): Promise<void> {
  if (process.platform !== 'darwin') return;
  if (process.env.ATRIA_TRAY_NOTIFIED === '1') return;
  process.env.ATRIA_TRAY_NOTIFIED = '1';
  try {
    const script = `display notification ${JSON.stringify(message)} with title ${JSON.stringify(AGENT_NAME)}`;
    await execFileAsync('osascript', ['-e', script]);
  } catch (err) {
    logger.debug('tray.notify_failed', { err: String(err) });
  }
}

function buildMenu(port: number, listening: boolean) {
  const status = listening
    ? `Estado: escuchando · :${port}`
    : 'Estado: detenido';
  return [
    { type: 'item' as const, id: 'status', title: status, enabled: false },
    { type: 'separator' as const, id: 'sep-1' },
    { type: 'item' as const, id: 'start', title: 'Encender', enabled: !listening },
    { type: 'item' as const, id: 'stop', title: 'Apagar', enabled: listening },
    { type: 'separator' as const, id: 'sep-2' },
    {
      type: 'item' as const,
      id: 'health',
      title: 'Abrir estado (health)',
      enabled: listening,
    },
    { type: 'item' as const, id: 'logs', title: 'Abrir registros' },
    {
      type: 'item' as const,
      id: 'about',
      title: `Acerca de · v${AGENT_VERSION}`,
      enabled: false,
    },
    { type: 'separator' as const, id: 'sep-3' },
    { type: 'item' as const, id: 'quit', title: 'Salir' },
  ];
}

/**
 * Menu bar / system tray (tray-hook MIT — daemon Rust precompilado, sin Electron).
 * En macOS la app usa LSUIElement: solo barra de menú, sin Dock.
 * Si el tray falla, el HTTP del Agent sigue; solo se loguea.
 */
export async function startStatusTray(opts: StatusTrayControls): Promise<StatusTrayHandle | null> {
  if (process.platform !== 'darwin' && process.platform !== 'win32') {
    return null;
  }

  let createTray: typeof import('tray-hook').createTray;
  try {
    ({ createTray } = await import('tray-hook'));
  } catch (err) {
    logger.warn('tray.module_unavailable', { err: String(err) });
    return null;
  }

  try {
    const tray = createTray({ autoRestart: true });
    tray.on('error', (err) => {
      logger.warn('tray.error', { err: err.message });
    });

    await tray.start();

    const icon = resolveTrayIconPath();
    if (icon) {
      await tray.setIcon(icon);
    } else {
      logger.warn('tray.icon_missing', { hint: 'assets/tray-icon.png' });
    }

    await tray.setTooltip(AGENT_NAME);
    if (process.platform === 'darwin') {
      try {
        await tray.setTrayTitle('');
      } catch {
        // opcional
      }
    }

    const applyMenu = async () => {
      await tray.setMenu(buildMenu(opts.port, opts.isListening()));
    };
    await applyMenu();

    tray.on('click', async (id) => {
      try {
        if (id === 'start') {
          await opts.onStart();
          await applyMenu();
          logger.info('tray.http_started');
        } else if (id === 'stop') {
          await opts.onStop();
          await applyMenu();
          logger.info('tray.http_stopped');
        } else if (id === 'health') {
          if (opts.isListening()) {
            await openUrl(`http://127.0.0.1:${opts.port}/health`);
          }
        } else if (id === 'logs') {
          await openPath(opts.logDir);
        } else if (id === 'quit') {
          await tray.quit();
          await opts.onQuit();
          process.exit(0);
        }
      } catch (err) {
        logger.warn('tray.action_failed', { id, err: String(err) });
        try {
          await applyMenu();
        } catch {
          // ignore
        }
      }
    });

    await notifyOnce(`${AGENT_NAME} está en la barra de menú`);
    logger.info('tray.started', { port: opts.port, icon: icon ?? null });

    return {
      stop: async () => {
        try {
          await tray.quit();
        } catch (err) {
          logger.debug('tray.stop_failed', { err: String(err) });
        }
      },
      refresh: applyMenu,
    };
  } catch (err) {
    logger.warn('tray.start_failed', {
      err: String(err),
      note: 'HTTP del Agent sigue activo sin ícono de barra',
    });
    return null;
  }
}
