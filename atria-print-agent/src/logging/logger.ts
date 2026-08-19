import fs from 'node:fs';
import path from 'node:path';
import { getLogDir } from '../config/paths.js';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const SENSITIVE_KEYS = /token|password|secret|authorization|private.?key/i;

function redact(value: unknown): unknown {
  if (value == null) return value;
  if (typeof value === 'string') {
    if (value.length > 200) return `${value.slice(0, 80)}…(${value.length} chars)`;
    return value;
  }
  if (Array.isArray(value)) return value.map(redact);
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SENSITIVE_KEYS.test(k) ? '[redacted]' : redact(v);
    }
    return out;
  }
  return value;
}

function logFilePath(): string {
  const day = new Date().toISOString().slice(0, 10);
  return path.join(getLogDir(), `agent-${day}.log`);
}

function writeLine(level: LogLevel, message: string, meta?: unknown): void {
  const ts = new Date().toISOString();
  const metaStr = meta === undefined ? '' : ` ${JSON.stringify(redact(meta))}`;
  const line = `${ts} [${level.toUpperCase()}] ${message}${metaStr}`;
  const consoleFn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
  consoleFn(line);
  try {
    fs.appendFileSync(logFilePath(), `${line}\n`);
  } catch {
    // No tumbar el agent si el disco de logs falla.
  }
}

export const logger = {
  debug: (message: string, meta?: unknown) => writeLine('debug', message, meta),
  info: (message: string, meta?: unknown) => writeLine('info', message, meta),
  warn: (message: string, meta?: unknown) => writeLine('warn', message, meta),
  error: (message: string, meta?: unknown) => writeLine('error', message, meta),
};
