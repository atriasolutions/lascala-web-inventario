import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config();

export const env = {
  port: Number(process.env.API_PORT || 4000),
  databaseUrl: process.env.DATABASE_URL || 'postgresql://lscala:lscala@localhost:5432/lscala',
  jwtSecret: process.env.JWT_SECRET || 'change-me-lscala-atria-dev-secret',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '12h',
  /** PWA instalada (standalone móvil). Escritorio / Chrome normal usa jwtExpiresIn. */
  jwtPersistentExpiresIn: process.env.JWT_PERSISTENT_EXPIRES_IN || '10y',
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  /** Origen del SPA para armar links de reset (fallback: CORS_ORIGIN). */
  webOrigin: process.env.WEB_ORIGIN || process.env.CORS_ORIGIN || 'http://localhost:5173',
  /** Expiración del token de reset en minutos. */
  passwordResetTtlMinutes: Number(process.env.PASSWORD_RESET_TTL_MINUTES || 60),
};
