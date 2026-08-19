import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

type PgLikeError = {
  code?: string;
  constraint?: string;
  detail?: string;
};

function asPgError(err: unknown): PgLikeError | null {
  if (!err || typeof err !== 'object') return null;
  const e = err as PgLikeError;
  return typeof e.code === 'string' ? e : null;
}

/** Violación de unique constraint PostgreSQL (23505). */
export function isUniqueViolation(err: unknown): boolean {
  return asPgError(err)?.code === '23505';
}

/** Mensajes claros para UNIQUE (Admin email/código, etc.). */
export function uniqueViolationMessage(err: unknown): string {
  const pg = asPgError(err);
  const c = pg?.constraint || '';
  const detail = pg?.detail || '';
  if (c === 'users_email_key' || c.includes('email') || /Key \(email\)/i.test(detail)) {
    return 'El email ya está registrado';
  }
  if (c === 'uq_products_org_barcode' || c.includes('barcode') || /Key \(.*barcode/i.test(detail)) {
    return 'El código de barras ya existe';
  }
  if (c.includes('internal_code') || /Key \(.*internal_code/i.test(detail)) {
    return 'El código interno ya existe';
  }
  return 'Ya existe un registro con esos datos';
}

/** Mensaje útil para errores de sync (PG check, FK, etc.). */
export function formatDbErrorMessage(err: unknown, fallback = 'Error de base de datos'): string {
  if (err instanceof HttpError) return err.message;
  const pg = asPgError(err);
  if (pg?.code === '23514') {
    const msg = err instanceof Error ? err.message : fallback;
    return `Restricción de datos: ${pg.constraint || 'check'} — ${pg.detail || msg}`;
  }
  if (pg?.code === '23503') {
    return `Referencia inválida: ${pg.detail || (err instanceof Error ? err.message : fallback)}`;
  }
  if (err instanceof Error && err.message) {
    if (pg?.detail) return `${err.message} (${pg.detail})`;
    return err.message;
  }
  return fallback;
}

export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}

function formatZodMessage(err: ZodError): string {
  const issue = err.issues[0];
  if (!issue) return 'Datos inválidos';
  const path = issue.path.length ? `${issue.path.join('.')}: ` : '';
  return `${path}${issue.message}`;
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  if (err instanceof ZodError) {
    res.status(400).json({ error: formatZodMessage(err) });
    return;
  }
  if (isUniqueViolation(err)) {
    res.status(409).json({ error: uniqueViolationMessage(err) });
    return;
  }
  console.error(err);
  res.status(500).json({ error: 'Error interno del servidor' });
}
