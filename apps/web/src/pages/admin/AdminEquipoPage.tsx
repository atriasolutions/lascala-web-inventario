import { PrinterPrefsCard } from '../../components/PrinterPrefsCard';
import { useAuth } from '../../lib/auth';

/** /admin/equipo — impresoras de este computador. */
export function AdminEquipoPage() {
  const { branches } = useAuth();
  const isOwner = branches.some((b) => b.role === 'owner');

  return (
    <div className="admin-panel" role="tabpanel">
      <PrinterPrefsCard />
      {!isOwner ? (
        <p className="muted admin-role-note">
          Sucursales, cajas y usuarios las gestiona Administrador/a.
        </p>
      ) : null}
    </div>
  );
}
