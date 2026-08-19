import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ensureReceiptPageCss, htmlToPlainText } from './htmlPrint.js';
import {
  BARCODE_LINE_RE,
  buildEscPosFromLines,
  CUT_FEED_BEFORE,
  CUT_LINE_RE,
  htmlToEscPosReceipt,
  wrapPlainText,
} from './escposReceipt.js';

describe('htmlPrint helpers', () => {
  it('injects @page when missing', () => {
    const out = ensureReceiptPageCss('<html><head></head><body>x</body></html>');
    assert.match(out, /@page/);
    assert.match(out, /80mm/);
  });

  it('strips tags to plain text', () => {
    const text = htmlToPlainText('<p>Hola<br/>mundo</p><div>Total: $1.000</div>');
    assert.match(text, /Hola/);
    assert.match(text, /mundo/);
    assert.match(text, /Total: \$1\.000/);
  });

  it('keeps space between label and value (dt/dd and span/strong)', () => {
    const fromDl = htmlToPlainText('<dl><div><dt>Fecha</dt><dd>12-08-2026</dd></div></dl>');
    assert.match(fromDl, /Fecha:\s+12-08-2026/);

    const fromKv = htmlToPlainText('<p>Fecha: 12-08-2026</p>');
    assert.match(fromKv, /Fecha:\s+12-08-2026/);

    const total = htmlToPlainText(
      '<div class="is-total"><span>TOTAL</span><strong>$9.980</strong></div>',
    );
    assert.match(total, /TOTAL\s+\$9\.980/);
    assert.doesNotMatch(total, /TOTAL\$/);
  });

  it('strips images (wordmark is texto, no bitmap)', () => {
    const text = htmlToPlainText(
      '<p>L\'SCALA</p><img class="sale-print-logo" src="/brand/lscala-logo.png" alt="" />',
    );
    assert.match(text, /L'SCALA/);
    assert.doesNotMatch(text, /\[\[\[LOGO\]\]\]/);
  });
});

describe('escposReceipt', () => {
  it('wraps long lines', () => {
    const lines = wrapPlainText('a'.repeat(50), 48);
    assert.equal(lines[0].length, 48);
    assert.ok(lines.length >= 2);
  });

  it('builds ESC/POS with init, generous feed and cut', () => {
    const buf = buildEscPosFromLines(['Hola']);
    assert.equal(buf[0], 0x1b);
    assert.equal(buf[1], 0x40);
    assert.ok(buf.includes(0x56));
    assert.match(buf.toString('latin1'), /Hola/);
  });

  it('matches spaced corte marker', () => {
    assert.ok(CUT_LINE_RE.test('- - - corte - - -'));
    assert.ok(CUT_LINE_RE.test('--- corte ---'));
  });

  it('inserts partial cut on corte markers', () => {
    const lines = ['COMPROBANTE', '- - - corte - - -', 'VOUCHER'];
    const buf = buildEscPosFromLines(lines);
    const asLatin = buf.toString('latin1');
    assert.match(asLatin, /COMPROBANTE/);
    assert.match(asLatin, /VOUCHER/);
    assert.doesNotMatch(asLatin, /corte/i);
    let cuts = 0;
    let feedBeforeCut = false;
    for (let i = 0; i < buf.length - 2; i++) {
      if (buf[i] === 0x1d && buf[i + 1] === 0x56) cuts += 1;
      if (buf[i] === 0x1b && buf[i + 1] === 0x64 && buf[i + 2] === CUT_FEED_BEFORE) {
        feedBeforeCut = true;
      }
    }
    assert.ok(cuts >= 2);
    assert.ok(feedBeforeCut);
  });

  it('emits centered wordmark from L\'SCALA line (no bitmap, no ESC !)', () => {
    const buf = buildEscPosFromLines(["L'SCALA"]);
    const latin = buf.toString('latin1');
    assert.match(latin, /L'SCALA/);
    assert.equal(latin.includes('[[[LOGO]]]'), false);
    let escStar = false;
    let escBang = false;
    for (let i = 0; i < buf.length - 2; i++) {
      if (buf[i] === 0x1b && buf[i + 1] === 0x2a) escStar = true;
      if (buf[i] === 0x1b && buf[i + 1] === 0x21) escBang = true;
    }
    assert.equal(escStar, false);
    assert.equal(escBang, false);
  });

  it('emits Code128 command from barcode marker', () => {
    assert.ok(BARCODE_LINE_RE.test('[[[BARCODE:BC000016]]]'));
    const buf = buildEscPosFromLines(['[[[BARCODE:BC000016]]]']);
    // GS k 73
    let found = false;
    for (let i = 0; i < buf.length - 3; i++) {
      if (buf[i] === 0x1d && buf[i + 1] === 0x6b && buf[i + 2] === 73) {
        found = true;
        break;
      }
    }
    assert.ok(found, 'expected GS k 73 Code128');
    assert.match(buf.toString('latin1'), /BC000016/);
  });

  it('injects brand header and uses 48-col separators on 80 mm', () => {
    const buf = htmlToEscPosReceipt(`<div>
      <p>Fecha: 12-08-2026</p>
      <p>TOTAL          $9.980</p>
      <p>- - - corte - - -</p>
      <p>[[[BARCODE:BC000001]]]</p>
      <p>CAMBIO</p>
    </div>`);
    const asStr = buf.toString('latin1');
    assert.match(asStr, /L'SCALA/);
    assert.match(asStr, /BOUTIQUE L'SCALA SPA/);
    assert.match(asStr, /Fecha:\s*12-08-2026/);
    assert.match(asStr, /TOTAL/);
    assert.match(asStr, /\$9\.980/);
    assert.doesNotMatch(asStr, /Fecha12/);
    assert.doesNotMatch(asStr, /TOTAL\$/);
    assert.doesNotMatch(asStr, /\[\[\[BARCODE/);
    assert.match(asStr, /BC000001/);
    assert.ok(!asStr.includes('%PDF'));
    // GS W 576 (80 mm)
    let gsW = false;
    for (let i = 0; i < buf.length - 3; i++) {
      if (buf[i] === 0x1d && buf[i + 1] === 0x57 && buf[i + 2] === 0x40 && buf[i + 3] === 0x02) {
        gsW = true;
      }
    }
    assert.ok(gsW);
  });
});
