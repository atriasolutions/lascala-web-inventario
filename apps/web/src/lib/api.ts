const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

/** Copy Chile cuando el API no es alcanzable (fetch / offline / ECONNREFUSED). */
export const NETWORK_ERROR_MESSAGE =
  'No pudimos conectar con el servidor. Revisa tu conexión e intenta más tarde.';

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export type User = {
  id: string;
  organizationId: string;
  email: string;
  fullName: string;
  branches: { branchId: string; role: string }[];
  /** Primer ingreso / clave temporal: hay que crear una nueva antes de usar el sistema. */
  mustChangePassword?: boolean;
  /** Soporte Atria: no listar en Admin. */
  isSuperadmin?: boolean;
};

type RequestOpts = {
  method?: string;
  body?: unknown;
  branchId?: string | null;
  posId?: string | null;
  token?: string | null;
};

export function isNetworkError(err: unknown): boolean {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return true;
  const msg = (err instanceof Error ? err.message : String(err || '')).trim();
  if (!msg) return false;
  const lower = msg.toLowerCase();
  return (
    lower === 'failed to fetch' ||
    lower.includes('networkerror') ||
    lower.includes('network request failed') ||
    lower.includes('load failed') ||
    lower.includes('econnrefused') ||
    lower.includes('err_connection') ||
    lower.includes('err_name_not_resolved') ||
    (err instanceof TypeError && (lower.includes('fetch') || lower.includes('network')))
  );
}

/** Mensaje seguro para UI; mapea fallos de red a copy amigable. */
export function userFacingError(err: unknown, fallback = 'Ocurrió un error'): string {
  if (isNetworkError(err)) return NETWORK_ERROR_MESSAGE;
  if (err instanceof Error) {
    const m = err.message.trim();
    if (m) return m;
  }
  return fallback;
}

export async function api<T = unknown>(path: string, opts: RequestOpts = {}): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = opts.token ?? localStorage.getItem('lscala_token');
  if (token) headers.Authorization = `Bearer ${token}`;
  const branchId = opts.branchId ?? localStorage.getItem('lscala_branch');
  const posId = opts.posId ?? localStorage.getItem('lscala_pos');
  if (branchId) headers['X-Branch-Id'] = branchId;
  if (posId) headers['X-Pos-Id'] = posId;

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method: opts.method || (opts.body ? 'POST' : 'GET'),
      headers,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
  } catch {
    throw new ApiError(0, NETWORK_ERROR_MESSAGE);
  }

  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) {
    throw new ApiError(res.status, data.error || 'Error de API');
  }
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
