import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { CommandRunner } from '../commandRunner.js';
import { PrinterError } from '../printer.interface.js';
import { MacosPrinterAdapter } from './index.js';

describe('MacosPrinterAdapter (mocked lpstat)', () => {
  it('lists from mocked CUPS output', async () => {
    const run: CommandRunner = async (_file, args) => {
      if (args.includes('-p')) {
        return {
          code: 0,
          stdout:
            'la impresora Brother_DCP_T520W está inactiva. activada desde Sun Jul 26 21:19:42 2026\n' +
            'la impresora Xprinter_XP-420B está inactiva. activada desde Sun Aug  9 00:16:37 2026\n',
          stderr: '',
        };
      }
      if (args.includes('-d')) {
        return {
          code: 0,
          stdout: 'destino por omisión del sistema: Brother_DCP_T520W\n',
          stderr: '',
        };
      }
      if (args.includes('-v')) {
        return {
          code: 0,
          stdout:
            'device for Brother_DCP_T520W: dnssd://Brother._ipp._tcp.local/\n' +
            'device for Xprinter_XP-420B: usb://Xprinter/XP-420B\n',
          stderr: '',
        };
      }
      return { code: 1, stdout: '', stderr: 'unexpected' };
    };

    const adapter = new MacosPrinterAdapter(run);
    const list = await adapter.listPrinters();
    assert.equal(list.length, 2);
    assert.equal(list.find((p) => p.name === 'Brother_DCP_T520W')?.isDefault, true);

    const status = await adapter.getPrinterStatus('Xprinter_XP-420B');
    assert.equal(status.status, 'idle');
    assert.equal(status.type, 'usb');

    await assert.rejects(
      () => adapter.getPrinterStatus('NoExiste'),
      (err: unknown) => err instanceof PrinterError && err.code === 'PRINTER_NOT_FOUND',
    );
  });
});

describe('MacosPrinterAdapter.printRaw (mocked lp)', () => {
  it('sends TSPL via lp -o raw on stdin', async () => {
    let seen: { file: string; args: string[]; stdin?: Buffer | string } | undefined;
    const run: CommandRunner = async (file, args, opts) => {
      seen = { file, args, stdin: opts?.stdin };
      return { code: 0, stdout: 'request id is Xprinter_XP-420B-1 (1 file(s))\n', stderr: '' };
    };
    const adapter = new MacosPrinterAdapter(run);
    const result = await adapter.printRaw({
      printer: 'Xprinter_XP-420B',
      data: 'SIZE 50 mm,25 mm\r\nPRINT 1,1\r\n',
      jobName: 'test-label',
    });
    assert.equal(result.ok, true);
    assert.equal(seen?.file, 'lp');
    assert.deepEqual(seen?.args, ['-d', 'Xprinter_XP-420B', '-o', 'raw', '-t', 'test-label']);
    assert.ok(seen?.stdin);
  });

  it('maps missing printer from lp stderr', async () => {
    const run: CommandRunner = async () => ({
      code: 1,
      stdout: '',
      stderr: 'lp: The printer or class does not exist.',
    });
    const adapter = new MacosPrinterAdapter(run);
    await assert.rejects(
      () =>
        adapter.printRaw({
          printer: 'Missing',
          data: 'PRINT 1,1\r\n',
        }),
      (err: unknown) => err instanceof PrinterError && err.code === 'PRINTER_NOT_FOUND',
    );
  });

  it('maps offline from lp stderr', async () => {
    const run: CommandRunner = async () => ({
      code: 1,
      stdout: '',
      stderr: 'lp: Unable to connect to printer — Device not found',
    });
    const adapter = new MacosPrinterAdapter(run);
    await assert.rejects(
      () => adapter.printRaw({ printer: 'Xprinter_XP-420B', data: 'PRINT 1,1\r\n' }),
      (err: unknown) => err instanceof PrinterError && err.code === 'PRINTER_OFFLINE',
    );
  });
});

describe('MacosPrinterAdapter.printHtml (mocked lp)', () => {
  it('sends ESC/POS via lp -o raw (never PDF)', async () => {
    let seen: { args: string[]; stdin?: Buffer | string } | undefined;
    const run: CommandRunner = async (file, args, opts) => {
      if (file === 'lp') {
        seen = { args, stdin: opts?.stdin };
        return { code: 0, stdout: 'request id is TM-T20-1\n', stderr: '' };
      }
      return { code: 1, stdout: '', stderr: 'no browser' };
    };
    const adapter = new MacosPrinterAdapter(run);
    const result = await adapter.printHtml({
      printer: 'Epson_TM_T20',
      html: '<html><body><p>COMPROBANTE DE VENTA</p><p>Total $1000</p></body></html>',
      jobName: 'comprobante',
    });
    assert.equal(result.ok, true);
    assert.deepEqual(seen?.args.slice(0, 4), ['-d', 'Epson_TM_T20', '-o', 'raw']);
    assert.ok(seen?.stdin);
    const buf = Buffer.isBuffer(seen?.stdin)
      ? seen!.stdin
      : Buffer.from(String(seen?.stdin ?? ''), 'binary');
    assert.equal(buf[0], 0x1b);
    assert.equal(buf[1], 0x40);
    assert.ok(!buf.toString('latin1').includes('%PDF'));
    assert.match(buf.toString('latin1'), /COMPROBANTE/);
  });
});
