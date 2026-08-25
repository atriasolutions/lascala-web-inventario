import type { Request, Response } from 'express';

/** SPA local + inventario en HTTPS. El Agent sigue solo en 127.0.0.1. */
export const CORS_ORIGINS = new Set([
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:4173',
  'http://127.0.0.1:4173',
  'https://inventario.lscala.cl',
]);

/** CORS + Private Network Access (Chrome: HTTPS público → loopback). */
export function applyAgentCors(req: Request, res: Response): boolean {
  const origin = req.header('Origin');
  if (!origin || !CORS_ORIGINS.has(origin)) return false;
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type, X-Atria-Print-Token, Access-Control-Request-Private-Network',
  );
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Private-Network', 'true');
  return true;
}
