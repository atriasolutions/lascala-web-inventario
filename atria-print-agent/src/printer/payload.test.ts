import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { decodePrintPayload } from './payload.js';
import { PrinterError } from './printer.interface.js';
import { SAMPLE_LABEL_TSPL } from '../fixtures/sampleTspl.js';

describe('decodePrintPayload', () => {
  it('accepts tspl utf8', () => {
    const decoded = decodePrintPayload({
      format: 'tspl',
      data: SAMPLE_LABEL_TSPL,
    });
    assert.equal(decoded.format, 'tspl');
    assert.ok(decoded.bytes.toString('utf8').includes('SIZE 50 mm,25 mm'));
    assert.ok(decoded.bytes.toString('utf8').includes('PRINT 1,1'));
  });

  it('accepts base64', () => {
    const b64 = Buffer.from(SAMPLE_LABEL_TSPL, 'utf8').toString('base64');
    const decoded = decodePrintPayload({ encoding: 'base64', data: b64 });
    assert.equal(decoded.format, 'raw');
    assert.equal(decoded.bytes.toString('utf8'), SAMPLE_LABEL_TSPL);
  });

  it('rejects html format', () => {
    assert.throws(
      () => decodePrintPayload({ format: 'html', data: '<p>x</p>' }),
      (err: unknown) => err instanceof PrinterError && err.code === 'UNSUPPORTED_FORMAT',
    );
  });
});
