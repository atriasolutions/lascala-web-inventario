import { Router, type Request } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import {
  countPushSubscriptions,
  isWebPushConfigured,
  removePushSubscription,
  savePushSubscription,
} from '../services/webPush.js';
import { asyncHandler, HttpError } from '../utils/errors.js';
import { env } from '../config.js';

export const pushRouter = Router();
pushRouter.use(requireAuth);

function requireOwner(req: Request) {
  const isOwner = req.user!.branches.some((b) => b.role === 'owner');
  if (!isOwner) throw new HttpError(403, 'Solo administradores pueden activar alertas push');
}

const subscribeBodySchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
});

const unsubscribeBodySchema = z.object({
  endpoint: z.string().url(),
});

pushRouter.get(
  '/vapid-public-key',
  asyncHandler(async (_req, res) => {
    if (!isWebPushConfigured()) {
      res.json({ publicKey: null, enabled: false });
      return;
    }
    res.json({ publicKey: env.vapidPublicKey, enabled: true });
  }),
);

pushRouter.post(
  '/subscribe',
  asyncHandler(async (req, res) => {
    requireOwner(req);
    if (!isWebPushConfigured()) {
      throw new HttpError(503, 'Alertas push no configuradas en el servidor');
    }
    const body = subscribeBodySchema.parse(req.body ?? {});
    await savePushSubscription({
      userId: req.user!.id,
      endpoint: body.endpoint,
      p256dh: body.keys.p256dh,
      auth: body.keys.auth,
      userAgent: req.headers['user-agent'],
    });
    const count = await countPushSubscriptions(req.user!.id);
    res.status(201).json({ ok: true, subscriptions: count });
  }),
);

pushRouter.post(
  '/unsubscribe',
  asyncHandler(async (req, res) => {
    requireOwner(req);
    const body = unsubscribeBodySchema.parse(req.body ?? {});
    await removePushSubscription({ userId: req.user!.id, endpoint: body.endpoint });
    const count = await countPushSubscriptions(req.user!.id);
    res.json({ ok: true, subscriptions: count });
  }),
);

pushRouter.get(
  '/status',
  asyncHandler(async (req, res) => {
    requireOwner(req);
    const count = await countPushSubscriptions(req.user!.id);
    res.json({ enabled: isWebPushConfigured(), subscriptions: count });
  }),
);
