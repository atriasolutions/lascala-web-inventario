import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseLpstatDefault, parseLpstatDevices, parseLpstatPrinters } from './parseLpstat.js';

describe('parseLpstat (EN)', () => {
  const sample = `
printer Brother_DCP_T520W is idle.  enabled since Sun Jul 26 21:19:42 2026
printer Xprinter_XP-420B now printing Xprinter_XP-420B-12.  enabled since Sun Aug  9 00:16:37 2026
printer Offline_Queue is disabled since Mon Aug 1 10:00:00 2026
system default destination: Brother_DCP_T520W
`;

  it('lists printers with status and default', () => {
    const devicesFixed = {
      Brother_DCP_T520W: 'dnssd://Brother._ipp._tcp.local/',
      'Xprinter_XP-420B': 'usb://Xprinter/XP-420B',
      Offline_Queue: 'file:///dev/null',
    };
    const list = parseLpstatPrinters(sample, {
      defaultName: parseLpstatDefault(sample),
      devices: devicesFixed,
    });
    assert.equal(list.length, 3);
    const brother = list.find((p) => p.name === 'Brother_DCP_T520W');
    assert.ok(brother);
    assert.equal(brother.status, 'idle');
    assert.equal(brother.isDefault, true);
    assert.equal(brother.source, 'cups');
    assert.equal(brother.type, 'network');

    const xp = list.find((p) => p.name === 'Xprinter_XP-420B');
    assert.ok(xp);
    assert.equal(xp.status, 'printing');
    assert.equal(xp.isDefault, false);
    assert.equal(xp.type, 'usb');

    const offline = list.find((p) => p.name === 'Offline_Queue');
    assert.ok(offline);
    assert.equal(offline.status, 'paused');
  });
});

describe('parseLpstat (ES — macOS localizado)', () => {
  const sample = `
la impresora Brother_DCP_T520W está inactiva. activada desde Sun Jul 26 21:19:42 2026
la impresora Xprinter_XP-420B está inactiva. activada desde Sun Aug  9 00:16:37 2026
destino por omisión del sistema: Brother_DCP_T520W
`;

  it('parses Spanish CUPS messages', () => {
    const list = parseLpstatPrinters(sample, {
      defaultName: parseLpstatDefault(sample),
      devices: parseLpstatDevices(`
device for Brother_DCP_T520W: dnssd://Brother._ipp._tcp.local/
device for Xprinter_XP-420B: usb://Xprinter/XP-420B
`),
    });
    assert.equal(list.length, 2);
    assert.equal(list.find((p) => p.name === 'Brother_DCP_T520W')?.isDefault, true);
    assert.equal(list.find((p) => p.name === 'Xprinter_XP-420B')?.status, 'idle');
    assert.equal(list.find((p) => p.name === 'Xprinter_XP-420B')?.type, 'usb');
  });
});
