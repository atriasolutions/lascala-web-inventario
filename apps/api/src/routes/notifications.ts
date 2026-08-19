import { Router, type Request } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import {
  buildLiveAlerts,
  dismissNotification,
  findNotificationState,
  markAllNotificationsRead,
  markNotificationRead,
  mergeNotifications,
  syncNotificationStates,
} from '../services/notifications.js';
import { asyncHandler, HttpError } from '../utils/errors.js';

export const notificationsRouter = Router();
notificationsRouter.use(requireAuth);

/** Acepta X-Branch-Id (middleware auth) o ?branch_id=. */
function resolveBranch(req: Request) {
  if (req.activeBranchId) return req.activeBranchId;
  const raw = req.query.branch_id;
  const branchId = typeof raw === 'string' ? raw : Array.isArray(raw) ? String(raw[0] || '') : '';
  if (!branchId) {
    throw new HttpError(400, 'Selecciona una sucursal (X-Branch-Id o ?branch_id=)');
  }
  const parsed = z.string().uuid().safeParse(branchId);
  if (!parsed.success) throw new HttpError(400, 'branch_id inválido');
  const access = req.user!.branches.find((b) => b.branchId === parsed.data);
  if (!access) throw new HttpError(403, 'Sin acceso a la sucursal');
  req.activeBranchId = parsed.data;
  req.activeRole = access.role;
  return parsed.data;
}

notificationsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const branchId = resolveBranch(req);
    const userId = req.user!.id;
    const organizationId = req.user!.organizationId;

    const live = await buildLiveAlerts(organizationId, branchId);
    const states = await syncNotificationStates({
      organizationId,
      branchId,
      userId,
      live,
    });
    const { items, unread_count } = mergeNotifications(branchId, live, states);
    res.json({ items, unread_count });
  }),
);

notificationsRouter.post(
  '/read-all',
  asyncHandler(async (req, res) => {
    const branchId = resolveBranch(req);
    const userId = req.user!.id;
    const organizationId = req.user!.organizationId;

    const live = await buildLiveAlerts(organizationId, branchId);
    await syncNotificationStates({ organizationId, branchId, userId, live });
    const updated = await markAllNotificationsRead({
      userId,
      branchId,
      alertKeys: live.map((a) => a.alertKey),
    });
    res.json({ ok: true, branch_id: branchId, updated });
  }),
);

notificationsRouter.post(
  '/:id/read',
  asyncHandler(async (req, res) => {
    const branchId = resolveBranch(req);
    const userId = req.user!.id;
    const organizationId = req.user!.organizationId;
    let state = await findNotificationState({
      userId,
      branchId,
      idOrKey: String(req.params.id),
    });
    if (!state) {
      const live = await buildLiveAlerts(organizationId, branchId);
      await syncNotificationStates({ organizationId, branchId, userId, live });
      state = await findNotificationState({
        userId,
        branchId,
        idOrKey: String(req.params.id),
      });
    }
    if (!state) throw new HttpError(404, 'Notificación no encontrada');
    await markNotificationRead(state.id);
    res.json({ ok: true });
  }),
);

notificationsRouter.post(
  '/:id/dismiss',
  asyncHandler(async (req, res) => {
    const branchId = resolveBranch(req);
    const userId = req.user!.id;
    const organizationId = req.user!.organizationId;
    let state = await findNotificationState({
      userId,
      branchId,
      idOrKey: String(req.params.id),
    });
    if (!state) {
      const live = await buildLiveAlerts(organizationId, branchId);
      await syncNotificationStates({ organizationId, branchId, userId, live });
      state = await findNotificationState({
        userId,
        branchId,
        idOrKey: String(req.params.id),
      });
    }
    if (!state) throw new HttpError(404, 'Notificación no encontrada');
    await dismissNotification(state.id);
    res.json({ ok: true });
  }),
);
