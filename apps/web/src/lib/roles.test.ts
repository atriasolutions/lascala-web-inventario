import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isAdminRole, isLeadRole, canRegisterProductCode, canCreateProductInIngresosNoBarcode, roleLabel } from './roles.ts';

describe('roles UI', () => {
  it('mapea labels Administrador/a Encargado/a Vendedor/a', () => {
    assert.equal(roleLabel('owner'), 'Administrador/a');
    assert.equal(roleLabel('branch_manager'), 'Encargado/a');
    assert.equal(roleLabel('seller'), 'Vendedor/a');
  });

  it('lead incluye admin y encargado; vendedor no ajusta', () => {
    assert.equal(isAdminRole('owner'), true);
    assert.equal(isAdminRole('branch_manager'), false);
    assert.equal(isLeadRole('owner'), true);
    assert.equal(isLeadRole('branch_manager'), true);
    assert.equal(isLeadRole('seller'), false);
  });

  it('alta de código solo lead', () => {
    assert.equal(canRegisterProductCode('owner'), true);
    assert.equal(canRegisterProductCode('branch_manager'), true);
    assert.equal(canRegisterProductCode('seller'), false);
    assert.equal(canCreateProductInIngresosNoBarcode('seller'), true);
    assert.equal(canCreateProductInIngresosNoBarcode('branch_manager'), true);
  });
});
