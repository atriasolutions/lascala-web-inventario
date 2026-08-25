import express from 'express';
import type { AgentConfig } from '../config/index.js';
import { logger } from '../logging/logger.js';
import type { PrinterAdapter } from '../printer/index.js';
import { applyAgentCors } from '../security/cors.js';
import { requirePrintToken } from '../security/token.js';
import { createRoutes } from './routes.js';

export function createApp(config: AgentConfig, printer: PrinterAdapter) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '2mb' }));

  app.use((req, res, next) => {
    applyAgentCors(req, res);
    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    next();
  });

  app.use((req, _res, next) => {
    logger.debug('http.request', { method: req.method, path: req.path });
    next();
  });

  const tokenGuard = requirePrintToken(config);
  app.use('/printers', tokenGuard);
  app.use('/print', tokenGuard);
  app.use('/print/raw', tokenGuard);
  app.use('/print/html', tokenGuard);
  app.use('/jobs', tokenGuard);

  app.use(createRoutes(config, printer));

  app.use((_req, res) => {
    res.status(404).json({ error: 'NOT_FOUND', message: 'Ruta no encontrada' });
  });

  return app;
}
