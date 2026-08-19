import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const WEB_URL = process.env.E2E_WEB_URL || 'http://localhost:5173';
const API_URL = process.env.E2E_API_URL || 'http://localhost:4000';
const EMAIL = process.env.E2E_EMAIL || 'admin@lscala.cl';
const PASSWORD = process.env.E2E_PASSWORD || 'Admin123!';

export const STATE_PATH = resolve('.playwright/storage-state.json');
export const FIXTURES_PATH = resolve('.playwright/fixtures.json');

type Branch = {
  id: string;
  name: string;
  pos_terminals?: { id: string; name: string; status: string }[];
};

export type Fixtures = {
  token: string;
  branchId: string;
  branchName: string;
  posId: string | null;
  branchIds: string[];
  /** Compra en estado `pending_reception`: alimenta `/ingresos/:id`. */
  ingresoId: string | null;
  /** Cualquier compra: alimenta `/compras/:id`. */
  compraId: string | null;
};

function writeJson(path: string, data: unknown) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(data, null, 2));
}

async function apiGet<T>(path: string, token: string, branchId?: string): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      ...(branchId ? { 'X-Branch-Id': branchId } : {}),
    },
  });
  if (!res.ok) throw new Error(`GET ${path} → ${res.status}`);
  return (await res.json()) as T;
}

export default async function globalSetup() {
  const loginRes = await fetch(`${API_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  if (!loginRes.ok) {
    throw new Error(
      `No se pudo iniciar sesión con ${EMAIL} (${loginRes.status}). ¿Está la API en ${API_URL} y la base sembrada?`,
    );
  }
  const { token } = (await loginRes.json()) as { token: string };

  const { branches } = await apiGet<{ branches: Branch[] }>('/api/auth/context/branches', token);
  const branch = branches[0];
  if (!branch) throw new Error('La usuaria de pruebas no tiene sucursales asignadas.');
  const pos = branch.pos_terminals?.find((p) => p.status === 'active') || null;

  let ingresoId: string | null = null;
  let compraId: string | null = null;
  try {
    const { purchases } = await apiGet<{ purchases: { id: string; status: string }[] }>(
      '/api/purchases?limit=25',
      token,
      branch.id,
    );
    ingresoId = purchases.find((p) => p.status === 'pending_reception')?.id ?? purchases[0]?.id ?? null;
    compraId = purchases[0]?.id ?? null;
  } catch {
    // Sin compras sembradas: las rutas de detalle se marcan como no verificables.
  }

  const fixtures: Fixtures = {
    token,
    branchId: branch.id,
    branchName: branch.name,
    posId: pos?.id ?? null,
    branchIds: branches.map((b) => b.id),
    ingresoId,
    compraId,
  };
  writeJson(FIXTURES_PATH, fixtures);

  const localStorage = [
    { name: 'lscala_token', value: token },
    { name: 'lscala_branch', value: branch.id },
    ...(pos ? [{ name: 'lscala_pos', value: pos.id }] : []),
  ];
  writeJson(STATE_PATH, {
    cookies: [],
    origins: [{ origin: WEB_URL, localStorage }],
  });
}
