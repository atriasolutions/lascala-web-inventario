import type { Request, Response, NextFunction } from 'express';
import type { AgentConfig } from '../config/index.js';

/**
 * Placeholder de seguridad (Fase 2).
 * Cuando `printToken` esté configurado, exige header `X-Atria-Print-Token`.
 * Health puede quedar abierto para probe de UI; printers/print se protegen.
 */
export function requirePrintToken(config: AgentConfig) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!config.printToken) {
      next();
      return;
    }
    const header = req.header('X-Atria-Print-Token');
    if (header !== config.printToken) {
      res.status(401).json({
        error: 'UNAUTHORIZED',
        message: 'Token de impresión inválido o ausente',
      });
      return;
    }
    next();
  };
}
