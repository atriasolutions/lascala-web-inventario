const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

export type User = {
  id: string;
  organizationId: string;
  email: string;
  fullName: string;
  branches: { branchId: string; role: string }[];
};

type RequestOpts = {
  method?: string;
  body?: unknown;
  branchId?: string | null;
  posId?: string | null;
  token?: string | null;
};

export async function api<T = unknown>(path: string, opts: RequestOpts = {}): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = opts.token ?? localStorage.getItem('lscala_token');
  if (token) headers.Authorization = `Bearer ${token}`;
  const branchId = opts.branchId ?? localStorage.getItem('lscala_branch');
  const posId = opts.posId ?? localStorage.getItem('lscala_pos');
  if (branchId) headers['X-Branch-Id'] = branchId;
  if (posId) headers['X-Pos-Id'] = posId;

  const res = await fetch(`${API_URL}${path}`, {
    method: opts.method || (opts.body ? 'POST' : 'GET'),
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Error de API');
  return data as T;
}

export function money(n: number | string) {
  const v = Number(n || 0);
  return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(v);
}

/**
 * Resuelve URLs de medios para <img>.
 * - http(s) / data: / blob: → tal cual
 * - /brand/… → origen del front (Vite public)
 * - /uploads/… y demás rutas API → VITE_API_URL
 */
export function mediaUrl(pathOrUrl: string | null | undefined) {
  if (!pathOrUrl) return '';
  const raw = pathOrUrl.trim();
  if (!raw) return '';
  if (/^(https?:|data:|blob:)/i.test(raw)) return raw;
  if (raw.startsWith('/brand/')) return raw;
  if (raw.startsWith('/uploads/') || !raw.startsWith('/')) {
    return `${API_URL}${raw.startsWith('/') ? '' : '/'}${raw}`;
  }
  return `${API_URL}${raw}`;
}
