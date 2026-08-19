/**
 * Único módulo que habla HTTP con Atria Print Agent (127.0.0.1:9876).
 * Componentes y páginas NO deben hacer fetch directo al Agent.
 */

import type { AgentHealth, Printer, PrinterStatus } from './types';

export const ATRIA_PRINT_AGENT_BASE = 'http://127.0.0.1:9876';

const TOKEN_STORAGE_KEY = 'lscala_atria_print_token';

/** Timeout corto: el Agent es local; si no responde, no está corriendo. */
const DEFAULT_TIMEOUT_MS = 2500;

export type AgentPrintRawBody = {
  printer: string;
  data: string;
  encoding?: 'utf8' | 'base64';
  jobName?: string;
};

export type AgentPrintHtmlBody = {
  printer: string;
  html: string;
  jobName?: string;
  widthMm?: number;
};

export type AgentErrorBody = {
  error?: string;
  message?: string;
  jobId?: string;
  status?: string;
};

export class AgentHttpError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'AgentHttpError';
    this.status = status;
    this.code = code;
  }

  get isUnsupported() {
    return this.status === 501 || this.code === 'UNSUPPORTED';
  }
}

export function getStoredPrintToken(): string | null {
  try {
    const t = localStorage.getItem(TOKEN_STORAGE_KEY)?.trim();
    return t || null;
  } catch {
    return null;
  }
}

export function setStoredPrintToken(token: string | null) {
  try {
    if (!token) localStorage.removeItem(TOKEN_STORAGE_KEY);
    else localStorage.setItem(TOKEN_STORAGE_KEY, token);
  } catch {
    /* ignore */
  }
}

function authHeaders(): HeadersInit {
  const token = getStoredPrintToken();
  return token ? { 'X-Atria-Print-Token': token } : {};
}

async function agentFetch(
  path: string,
  init?: RequestInit & { timeoutMs?: number },
): Promise<Response> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, ...rest } = init || {};
  const ctrl = new AbortController();
  const timer = window.setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(`${ATRIA_PRINT_AGENT_BASE}${path}`, {
      ...rest,
      signal: ctrl.signal,
      headers: {
        Accept: 'application/json',
        ...authHeaders(),
        ...(rest.headers || {}),
      },
    });
  } finally {
    window.clearTimeout(timer);
  }
}

function normalizeStatus(raw: unknown): PrinterStatus {
  const s = String(raw || 'unknown');
  if (
    s === 'idle' ||
    s === 'printing' ||
    s === 'paused' ||
    s === 'offline' ||
    s === 'error' ||
    s === 'unknown'
  ) {
    return s;
  }
  return 'unknown';
}

function mapPrinter(row: Record<string, unknown>): Printer | null {
  const name = String(row.name || '').trim();
  if (!name) return null;
  return {
    name,
    status: normalizeStatus(row.status),
    isDefault: Boolean(row.isDefault),
    source: row.source ? String(row.source) : undefined,
    type: row.type ? String(row.type) : undefined,
  };
}

export async function fetchAgentHealth(): Promise<AgentHealth | null> {
  try {
    const res = await agentFetch('/health', { method: 'GET', timeoutMs: 1500 });
    if (!res.ok) return null;
    const data = (await res.json()) as Record<string, unknown>;
    if (!data.ok && data.status !== 'ok') return null;
    return {
      ok: true,
      name: data.name ? String(data.name) : data.agent ? String(data.agent) : 'Atria Print Agent',
      version: data.version ? String(data.version) : undefined,
      platform: data.platform ? String(data.platform) : undefined,
      agentId: data.agentId ? String(data.agentId) : undefined,
    };
  } catch {
    return null;
  }
}

export async function fetchAgentPrinters(): Promise<Printer[]> {
  const res = await agentFetch('/printers', { method: 'GET' });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as AgentErrorBody;
    throw new AgentHttpError(
      res.status,
      body.error || 'PRINTERS_LIST_FAILED',
      body.message || 'No se pudo listar impresoras del Agent',
    );
  }
  const data = (await res.json()) as { printers?: unknown[] };
  const list = Array.isArray(data.printers) ? data.printers : [];
  return list
    .map((row) => mapPrinter((row || {}) as Record<string, unknown>))
    .filter((p): p is Printer => Boolean(p));
}

export async function postAgentPrintRaw(body: AgentPrintRawBody): Promise<{ jobId?: string }> {
  const res = await agentFetch('/print/raw', {
    method: 'POST',
    timeoutMs: 8000,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const payload = (await res.json().catch(() => ({}))) as AgentErrorBody & { ok?: boolean };
  if (!res.ok) {
    throw new AgentHttpError(
      res.status,
      payload.error || 'PRINT_FAILED',
      payload.message || 'El Agent no pudo imprimir',
    );
  }
  return { jobId: payload.jobId };
}

export async function postAgentPrintHtml(body: AgentPrintHtmlBody): Promise<{ jobId?: string }> {
  const res = await agentFetch('/print/html', {
    method: 'POST',
    timeoutMs: 45_000,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const payload = (await res.json().catch(() => ({}))) as AgentErrorBody & { ok?: boolean };
  if (!res.ok) {
    throw new AgentHttpError(
      res.status,
      payload.error || 'PRINT_FAILED',
      payload.message || 'El Agent no pudo imprimir el comprobante',
    );
  }
  return { jobId: payload.jobId };
}
