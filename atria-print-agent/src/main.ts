import { loadOrCreateConfig, AGENT_NAME, AGENT_VERSION, DEFAULT_HOST } from './config/index.js';
import { getLogDir, getUserDataDir } from './config/paths.js';
import { logger } from './logging/logger.js';
import {
  ensureMacLaunchAgent,
  isPackagedRuntime,
  resolvePackagedLauncherPath,
  unloadMacLaunchAgent,
} from './macos/launchAgent.js';
import { createPrinterAdapter } from './printer/index.js';
import { createApp } from './server/app.js';
import { startStatusTray } from './tray/statusTray.js';
import type { Server } from 'node:http';

async function listenHttp(
  app: ReturnType<typeof createApp>,
  host: string,
  port: number,
): Promise<Server> {
  return new Promise((resolve, reject) => {
    const s = app.listen(port, host, () => resolve(s));
    s.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        logger.error('agent.port_in_use', {
          bind: `${host}:${port}`,
          hint: 'Otro proceso ya usa 9876. En Mac: launchctl bootout gui/$(id -u)/com.atria.print-agent',
        });
      }
      reject(err);
    });
  });
}

function closeHttp(server: Server | null): Promise<void> {
  if (!server) return Promise.resolve();
  return new Promise((resolve) => {
    server.close(() => resolve());
  });
}

async function main(): Promise<void> {
  const config = loadOrCreateConfig();

  const launcher = resolvePackagedLauncherPath();
  if (
    process.platform === 'darwin' &&
    isPackagedRuntime() &&
    launcher &&
    launcher.startsWith('/Applications/')
  ) {
    try {
      ensureMacLaunchAgent(launcher, getLogDir());
    } catch (err) {
      logger.warn('launchagent.ensure_failed', { err: String(err) });
    }
  }

  const printer = createPrinterAdapter();
  const app = createApp(config, printer);

  const host = DEFAULT_HOST;
  const port = config.port;

  let server: Server | null = await listenHttp(app, host, port);

  logger.info('agent.started', {
    agent: AGENT_NAME,
    version: AGENT_VERSION,
    bind: `${host}:${port}`,
    platform: process.platform,
    agentId: config.agentId,
    userDataDir: getUserDataDir(),
    packaged: isPackagedRuntime(),
  });

  const tray = await startStatusTray({
    port,
    logDir: getLogDir(),
    isListening: () => server != null && server.listening,
    onStart: async () => {
      if (server?.listening) return;
      await closeHttp(server);
      server = null;
      server = await listenHttp(app, host, port);
      logger.info('agent.http_resumed', { bind: `${host}:${port}` });
    },
    onStop: async () => {
      if (!server) return;
      await closeHttp(server);
      server = null;
      logger.info('agent.http_paused', { port });
    },
    onQuit: async () => {
      // Evita que launchd resuscite el proceso tras Salir limpio.
      try {
        unloadMacLaunchAgent();
      } catch (err) {
        logger.debug('launchagent.unload_on_quit_failed', { err: String(err) });
      }
      await closeHttp(server);
      server = null;
    },
  });

  const shutdown = async (signal: string) => {
    logger.info('agent.shutdown', { signal });
    if (tray) await tray.stop();
    await closeHttp(server);
    server = null;
    process.exit(0);
  };
  process.once('SIGINT', () => void shutdown('SIGINT'));
  process.once('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  logger.error('agent.fatal', { err: String(err) });
  process.exit(1);
});
