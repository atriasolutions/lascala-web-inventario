import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  canonicalizeStoredProductCode,
  expandProductCodeVariants,
  formatInternalCode,
  formatReceiptNumber,
  formatVoucherNumber,
} from './inventory.js';

describe('formatInternalCode', () => {
  it('pads to 6 digits without hyphen', () => {
    assert.equal(formatInternalCode(1), 'LS000001');
    assert.equal(formatInternalCode(42), 'LS000042');
    assert.equal(formatInternalCode(100017), 'LS100017');
  });

  it('clamps non-positive and floors floats', () => {
    assert.equal(formatInternalCode(0), 'LS000001');
    assert.equal(formatInternalCode(3.9), 'LS000003');
  });
});

describe('formatReceiptNumber / formatVoucherNumber', () => {
  it('emite boleta y ticket sin guión', () => {
    assert.equal(formatReceiptNumber(19), 'V000019');
    assert.equal(formatVoucherNumber(94), 'VC000094');
  });
});

describe('canonicalizeStoredProductCode', () => {
  it('guarda LS/BC sin guión y con padding', () => {
    assert.equal(canonicalizeStoredProductCode('LS-100007'), 'LS100007');
    assert.equal(canonicalizeStoredProductCode('ls12'), 'LS000012');
    assert.equal(canonicalizeStoredProductCode('BC-3'), 'BC000003');
    assert.equal(canonicalizeStoredProductCode('LS-JEANS-001'), 'LS-JEANS-001');
  });
});

describe('expandProductCodeVariants', () => {
  it('acepta LS con y sin guión', () => {
    const keys = new Set(expandProductCodeVariants('LS100007'));
    assert.ok(keys.has('LS100007'));
    assert.ok(keys.has('LS-100007'));
  });
});
