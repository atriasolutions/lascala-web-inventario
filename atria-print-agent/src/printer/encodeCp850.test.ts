import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { encodeCp850, ESC_POS_CODE_PAGE_CP850 } from './encodeCp850.js';
import { buildEscPosFromLines, htmlToEscPosReceipt } from './escposReceipt.js';
import { buildEscPosLogo } from './escposLogo.js';

describe('encodeCp850', () => {
  it('maps lowercase Spanish tildes (CP437 ∩ CP850)', () => {
    const buf = encodeCp850('áéíóúñ');
    assert.deepEqual([...buf], [0xa0, 0x82, 0xa1, 0xa2, 0xa3, 0xa4]);
    assert.notEqual(buf[0], 0xe1);
  });

  it('folds ÓÁÍÚ to ASCII so CP437 no imprime alfa (DEVOLUCIaN)', () => {
    const buf = encodeCp850('DEVOLUCIÓN ÁÍÚ');
    const idx = buf.indexOf(Buffer.from('DEVOLUCI', 'ascii'));
    assert.ok(idx >= 0);
    assert.equal(buf[idx + 8], 'O'.charCodeAt(0));
    assert.equal(buf.includes(0xe0), false);
    assert.deepEqual(
      [...encodeCp850('ÁÍÓÚ')],
      ['A', 'I', 'O', 'U'].map((c) => c.charCodeAt(0)),
    );
  });

  it('keeps É and Ñ (iguales en CP437 y CP850)', () => {
    assert.deepEqual([...encodeCp850('ÉÑ')], [0x90, 0xa5]);
  });

  it('keeps ASCII and maps middle-dot used in tickets', () => {
    const buf = encodeCp850("Gracias · L'Scala");
    assert.match(buf.toString('ascii'), /Gracias/);
    assert.equal(buf[8], 0xfa);
  });

  it('folds unmapped accents as last resort', () => {
    const buf = encodeCp850('å');
    assert.equal(buf[0], 'a'.charCodeAt(0));
  });
});

describe('escpos logo + encoding job', () => {
  it('selects CP850 at job start (ESC t 2)', () => {
    const buf = buildEscPosFromLines(['Hola']);
    assert.equal(buf[0], 0x1b);
    assert.equal(buf[1], 0x40);
    assert.deepEqual([...buf.subarray(2, 5)], [...ESC_POS_CODE_PAGE_CP850]);
  });

  it('prints DEVOLUCION not DEVOLUCIaN', () => {
    const buf = buildEscPosFromLines(['CAMBIO / DEVOLUCIÓN']);
    assert.match(buf.toString('latin1'), /DEVOLUCION/);
    assert.equal(buf.includes(0xe0), false);
  });

  it('uses centered wordmark — never bitmap leftover as text', () => {
    const logo = buildEscPosLogo();
    const asAscii = logo.toString('latin1');
    assert.match(asAscii, /L'SCALA/);
    assert.equal(asAscii.includes('[[[LOGO]]]'), false);
    assert.equal(asAscii.includes('PNG'), false);
    let escStar = false;
    let gsV = false;
    let escBang = false;
    for (let i = 0; i < logo.length - 2; i++) {
      if (logo[i] === 0x1b && logo[i + 1] === 0x2a) escStar = true;
      if (logo[i] === 0x1d && logo[i + 1] === 0x76) gsV = true;
      if (logo[i] === 0x1b && logo[i + 1] === 0x21) escBang = true;
    }
    assert.equal(escStar, false);
    assert.equal(gsV, false);
    assert.equal(escBang, false);
  });

  it('HTML without brand still prints L\'SCALA + boutique', () => {
    const buf = htmlToEscPosReceipt('<p>devolución</p>');
    const latin = buf.toString('latin1');
    assert.match(latin, /L'SCALA/);
    assert.match(latin, /BOUTIQUE L'SCALA SPA/);
    const idx = buf.indexOf(Buffer.from('devoluci', 'ascii'));
    assert.ok(idx >= 0);
    assert.equal(buf[idx + 8], 0xa2);
  });
});
