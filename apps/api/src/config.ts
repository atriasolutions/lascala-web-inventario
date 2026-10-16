import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function corsOrigins() {
  const raw = process.env.CORS_ORIGIN || 'http://localhost:5173';
  const list = raw.split(',').map((s) => s.trim()).filter(Boolean);
  const twins = list.flatMap((origin) => {
    if (origin.includes('://localhost:')) return [origin.replace('://localhost:', '://127.0.0.1:')];
    if (origin.includes('://127.0.0.1:')) return [origin.replace('://127.0.0.1:', '://localhost:')];
    return [];
  });
  return [...new Set([...list, ...twins])];
}

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
  corsOrigin: corsOrigins(),
  /** Origen del SPA (links / CORS). */
  webOrigin: process.env.WEB_ORIGIN || process.env.CORS_ORIGIN || 'http://localhost:5173',
  /** Web Push (VAPID). Generar con: npx web-push generate-vapid-keys */
  vapidPublicKey: process.env.VAPID_PUBLIC_KEY || '',
  vapidPrivateKey: process.env.VAPID_PRIVATE_KEY || '',
  vapidSubject: process.env.VAPID_SUBJECT || 'mailto:soporte@atria.cl',
};
