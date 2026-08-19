import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  mapWinPrinterStatus,
  parseWinPrinterJson,
  parseWinPrinterRows,
} from './parseWinPrinters.js';

describe('mapWinPrinterStatus', () => {
  it('maps WMI codes', () => {
    assert.equal(mapWinPrinterStatus(3, false), 'idle');
    assert.equal(mapWinPrinterStatus(4, false), 'printing');
    assert.equal(mapWinPrinterStatus(7, false), 'offline');
    assert.equal(mapWinPrinterStatus(3, true), 'offline');
  });
});

describe('parseWinPrinterJson', () => {
  it('parses array from PowerShell', () => {
    const json = JSON.stringify([
      {
        Name: 'XP-420B',
        Default: true,
        PrinterStatus: 3,
        WorkOffline: false,
        PortName: 'USB001',
        Local: true,
      },
      {
        Name: 'Brother',
        Default: false,
        PrinterStatus: 4,
        WorkOffline: false,
        PortName: 'WSD-abc',
        Network: true,
      },
    ]);
    const list = parseWinPrinterJson(json);
    assert.equal(list.length, 2);
    const xp = list.find((p) => p.name === 'XP-420B');
    assert.ok(xp);
    assert.equal(xp.isDefault, true);
    assert.equal(xp.status, 'idle');
    assert.equal(xp.source, 'winspool');
    assert.equal(xp.type, 'usb');
    assert.equal(list.find((p) => p.name === 'Brother')?.status, 'printing');
    assert.equal(list.find((p) => p.name === 'Brother')?.type, 'network');
  });

  it('parses single object', () => {
    const list = parseWinPrinterRows([
      { Name: 'OnlyOne', Default: true, PrinterStatus: 3, PortName: 'LPT1:' },
    ]);
    assert.equal(list.length, 1);
    assert.equal(list[0].name, 'OnlyOne');
  });

  it('returns empty for blank stdout', () => {
    assert.deepEqual(parseWinPrinterJson(''), []);
  });
});
