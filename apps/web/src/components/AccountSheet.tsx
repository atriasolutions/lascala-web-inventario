import { type FormEvent, useEffect, useId, useState } from 'react';
import { ModalOverlayClose } from './ModalOverlayClose';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { toast } from '../lib/toast';

type Props = {
  open: boolean;
  onClose: () => void;
};

/** Ficha simple de “mi cuenta”: nombre y contraseña. Sin borrar ni cambiar rol. */
export function AccountSheet({ open, onClose }: Props) {
  const { user, refreshUser } = useAuth();
  const titleId = useId();
  const [fullName, setFullName] = useState(user?.fullName || '');
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setFullName(user?.fullName || '');
    setPassword('');
  }, [open, user?.fullName]);

  if (!open) return null;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const name = fullName.trim();
    if (!name) {
      toast.warn('Ingresa tu nombre');
      return;
    }
    setSaving(true);
    try {
      const body: { fullName: string; password?: string } = { fullName: name };
      if (password.trim()) body.password = password;
      await api('/api/auth/me', {
        method: 'PATCH',
        body,
      });
      await refreshUser();
      toast.success('Datos actualizados');
      setPassword('');
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo guardar');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="pos-modal open"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <ModalOverlayClose onClose={onClose}>
      <div
        className="pos-modal-panel admin-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="pos-modal-head">
          <h3 id={titleId}>Mi cuenta</h3>
        </div>
        <form className="admin-sheet-form" onSubmit={onSubmit}>
          <div className="field">
            <label htmlFor="account-name">Nombre</label>
            <input
              id="account-name"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              autoComplete="name"
            />
          </div>
          <div className="field">
            <label htmlFor="account-email">Email</label>
            <input id="account-email" value={user?.email || ''} readOnly disabled />
            <span className="muted admin-field-hint">
              El email lo cambia Administrador/a en Ajustes → Usuarios.
            </span>
          </div>
          <div className="field">
            <label htmlFor="account-pass">Nueva contraseña (opcional)</label>
            <input
              id="account-pass"
              type="password"
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
            />
          </div>
          <p className="muted admin-field-hint">No puedes desactivar ni eliminar tu propia cuenta.</p>
          <div className="admin-sheet-actions">
            <button type="button" className="btn ghost" onClick={onClose}>
              Cancelar
            </button>
            <button className="btn" type="submit" disabled={saving}>
              {saving ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </form>
      </div></ModalOverlayClose>
    </div>
  );
}
