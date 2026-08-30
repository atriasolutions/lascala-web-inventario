import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  canUseMobileApp,
  hasFullMobileNav,
  isAdminRole,
  isLeadRole,
  isMobileStaffRouteAllowed,
  canRegisterProductCode,
  canCreateProductInIngresosNoBarcode,
  roleLabel,
} from './roles.ts';

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

  it('mobile: owner nav completo; staff consulta acotada', () => {
    assert.equal(canUseMobileApp(null, 'owner'), true);
    assert.equal(canUseMobileApp(null, 'branch_manager'), true);
    assert.equal(canUseMobileApp(null, 'seller'), true);
    assert.equal(hasFullMobileNav(null, 'owner'), true);
    assert.equal(hasFullMobileNav(null, 'branch_manager'), false);
    assert.equal(isMobileStaffRouteAllowed('/ventas'), true);
    assert.equal(isMobileStaffRouteAllowed('/productos'), true);
    assert.equal(isMobileStaffRouteAllowed('/inventario'), true);
    assert.equal(isMobileStaffRouteAllowed('/ayuda/overview'), true);
    assert.equal(isMobileStaffRouteAllowed('/compras'), false);
    assert.equal(isMobileStaffRouteAllowed('/vender'), false);
  });
});
