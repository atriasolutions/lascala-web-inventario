import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { assertCanResetUserPassword } from '../auth/roles.ts';
import { HttpError } from '../utils/errors.ts';
import { computeMustChangePassword } from '../middleware/auth.ts';

describe('computeMustChangePassword', () => {
  it('true si flag o nunca cambió', () => {
    assert.equal(
      computeMustChangePassword({ must_change_password: true, password_changed_at: new Date() }),
      true,
    );
    assert.equal(
      computeMustChangePassword({ must_change_password: false, password_changed_at: null }),
      true,
    );
    assert.equal(
      computeMustChangePassword({ must_change_password: false, password_changed_at: new Date() }),
      false,
    );
  });
});

describe('assertCanResetUserPassword', () => {
  const owner = { id: 'o1', isSuperadmin: false, isOwner: true };
  const superadmin = { id: 's1', isSuperadmin: true, isOwner: true };
  const sellerTarget = { id: 'v1', isSuperadmin: false, isOwner: false };
  const adminTarget = { id: 'a1', isSuperadmin: false, isOwner: true };

  it('admin puede resetear vendedora', () => {
    assert.doesNotThrow(() => assertCanResetUserPassword(owner, sellerTarget));
  });

  it('admin no puede resetear a otra admin', () => {
    assert.throws(
      () => assertCanResetUserPassword(owner, adminTarget),
      (e: unknown) => e instanceof HttpError && e.status === 403,
    );
  });

  it('superadmin puede resetear admin', () => {
    assert.doesNotThrow(() => assertCanResetUserPassword(superadmin, adminTarget));
  });

  it('superadmin oculto: target superadmin → 404', () => {
    assert.throws(
      () =>
        assertCanResetUserPassword(superadmin, {
          id: 's2',
          isSuperadmin: true,
          isOwner: true,
        }),
      (e: unknown) => e instanceof HttpError && e.status === 404,
    );
  });

  it('no reseatearse a sí misma por endpoint admin', () => {
    assert.throws(
      () => assertCanResetUserPassword(owner, { id: 'o1', isSuperadmin: false, isOwner: true }),
      (e: unknown) => e instanceof HttpError && e.status === 400,
    );
  });
});
