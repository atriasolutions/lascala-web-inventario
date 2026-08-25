import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { AddressInfo } from 'node:net';
import { createApp } from './app.js';
import type { AgentConfig } from '../config/index.js';
import type { PrinterAdapter, PrinterInfo, PrintHtmlJob, PrintRawJob, PrintResult } from '../printer/printer.interface.js';

const config: AgentConfig = {
  agentId: 'test-agent',
  printToken: null,
  host: '127.0.0.1',
  port: 0,
};

const stubPrinter: PrinterAdapter = {
  platform: 'darwin',
  async listPrinters(): Promise<PrinterInfo[]> {
    return [];
  },
  async getPrinterStatus(name: string): Promise<PrinterInfo> {
    return { name, status: 'unknown', isDefault: false, source: 'stub' };
  },
  async printRaw(_job: PrintRawJob): Promise<PrintResult> {
    return { ok: true };
  },
  async printHtml(_job: PrintHtmlJob): Promise<PrintResult> {
    return { ok: true };
  },
};

async function withServer(fn: (base: string) => Promise<void>) {
  const app = createApp(config, stubPrinter);
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', () => resolve()));
  const { port } = server.address() as AddressInfo;
  try {
    await fn(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }
}

describe('agent CORS', () => {
  it('permite inventario.lscala.cl y Private Network Access', async () => {
    await withServer(async (base) => {
      const origin = 'https://inventario.lscala.cl';
      const pre = await fetch(`${base}/health`, {
        method: 'OPTIONS',
        headers: {
          Origin: origin,
          'Access-Control-Request-Method': 'GET',
          'Access-Control-Request-Private-Network': 'true',
        },
      });
      assert.equal(pre.status, 204);
      assert.equal(pre.headers.get('access-control-allow-origin'), origin);
      assert.equal(pre.headers.get('access-control-allow-private-network'), 'true');

      const get = await fetch(`${base}/health`, { headers: { Origin: origin } });
      assert.equal(get.status, 200);
      assert.equal(get.headers.get('access-control-allow-origin'), origin);
      const body = (await get.json()) as { ok?: boolean };
      assert.equal(body.ok, true);
    });
  });

  it('no refleja un origen ajeno', async () => {
    await withServer(async (base) => {
      const get = await fetch(`${base}/health`, {
        headers: { Origin: 'https://evil.example' },
      });
      assert.equal(get.status, 200);
      assert.equal(get.headers.get('access-control-allow-origin'), null);
    });
  });
});
