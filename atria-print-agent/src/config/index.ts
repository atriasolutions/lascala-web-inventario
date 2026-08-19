import crypto from 'node:crypto';
import fs from 'node:fs';
import { getConfigPath } from './paths.js';

export const AGENT_NAME = 'Atria Print Agent';
export const AGENT_VERSION = '0.1.0';
export const DEFAULT_HOST = '127.0.0.1';
export const DEFAULT_PORT = 9876;

export type AgentConfig = {
  /** UUID v4 persistente; no es PII. */
  agentId: string;
  /** Placeholder Fase 2 — auth real en fases posteriores. */
  printToken: string | null;
  host: string;
  port: number;
};

function createDefaultConfig(): AgentConfig {
  return {
    agentId: crypto.randomUUID(),
    printToken: null,
    host: DEFAULT_HOST,
    port: DEFAULT_PORT,
  };
}

export function loadOrCreateConfig(): AgentConfig {
  const configPath = getConfigPath();
  if (fs.existsSync(configPath)) {
    try {
      const raw = JSON.parse(fs.readFileSync(configPath, 'utf8')) as Partial<AgentConfig>;
      const merged: AgentConfig = {
        ...createDefaultConfig(),
        ...raw,
        // Hardening: nunca bind fuera de loopback en default de producto/dev.
        host: DEFAULT_HOST,
        port: typeof raw.port === 'number' ? raw.port : DEFAULT_PORT,
      };
      if (!merged.agentId) {
        merged.agentId = crypto.randomUUID();
        saveConfig(merged);
      }
      return merged;
    } catch {
      // Archivo corrupto → regenerar.
    }
  }
  const fresh = createDefaultConfig();
  saveConfig(fresh);
  return fresh;
}

export function saveConfig(config: AgentConfig): void {
  const configPath = getConfigPath();
  fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
}
