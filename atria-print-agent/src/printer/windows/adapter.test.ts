import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { CommandRunner } from '../commandRunner.js';
import { PrinterError } from '../printer.interface.js';
import { WindowsPrinterAdapter } from './index.js';

describe('WindowsPrinterAdapter (mocked PowerShell)', () => {
  it('lists from mocked CIM JSON', async () => {
    const run: CommandRunner = async () => ({
      code: 0,
      stdout: JSON.stringify([
        {
          Name: 'XP-420B',
          Default: true,
          PrinterStatus: 3,
          WorkOffline: false,
          PortName: 'USB001',
          Local: true,
        },
      ]),
      stderr: '',
    });

    const adapter = new WindowsPrinterAdapter(run);
    const list = await adapter.listPrinters();
    assert.equal(list.length, 1);
    assert.equal(list[0].name, 'XP-420B');
    assert.equal(list[0].source, 'winspool');

    const status = await adapter.getPrinterStatus('xp-420b');
    assert.equal(status.isDefault, true);

    await assert.rejects(
      () => adapter.getPrinterStatus('Missing'),
      (err: unknown) => err instanceof PrinterError && err.code === 'PRINTER_NOT_FOUND',
    );
  });

  it('printRaw succeeds when PowerShell returns OK', async () => {
    const run: CommandRunner = async (file, args) => {
      if (args.includes('-Command')) {
        return { code: 0, stdout: '[]', stderr: '' };
      }
      // -File print-raw.ps1
      return { code: 0, stdout: 'OK:42\n', stderr: '' };
    };
    const adapter = new WindowsPrinterAdapter(run);
    const result = await adapter.printRaw({
      printer: 'XP-420B',
      data: 'SIZE 50 mm,25 mm\r\nPRINT 1,1\r\n',
      jobName: 'win-test',
    });
    assert.equal(result.ok, true);
  });

  it('printRaw maps OPEN_FAILED to PRINTER_NOT_FOUND', async () => {
    const run: CommandRunner = async (_file, args) => {
      if (args.includes('-File')) {
        return { code: 1, stdout: '', stderr: 'OPEN_FAILED:1801' };
      }
      return { code: 0, stdout: '[]', stderr: '' };
    };
    const adapter = new WindowsPrinterAdapter(run);
    await assert.rejects(
      () => adapter.printRaw({ printer: 'Gone', data: 'PRINT 1,1\r\n' }),
      (err: unknown) => err instanceof PrinterError && err.code === 'PRINTER_NOT_FOUND',
    );
  });
});
