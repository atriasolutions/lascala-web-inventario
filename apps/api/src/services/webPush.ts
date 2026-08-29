import webpush from 'web-push';
import { env } from '../config.js';
import { query } from '../db/pool.js';

export type WebPushPayload = {
  title: string;
  body: string;
  url: string;
  tag?: string;
};

type PushSubscriptionRow = {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

let vapidReady = false;

export function isWebPushConfigured(): boolean {
  return Boolean(env.vapidPublicKey && env.vapidPrivateKey);
}

function ensureVapidConfigured(): boolean {
  if (!isWebPushConfigured()) return false;
  if (!vapidReady) {
    webpush.setVapidDetails(env.vapidSubject, env.vapidPublicKey!, env.vapidPrivateKey!);
    vapidReady = true;
  }
  return true;
}

function isGoneSubscriptionError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const statusCode = (err as { statusCode?: number }).statusCode;
  return statusCode === 410 || statusCode === 404;
}

export async function sendWebPushToUser(userId: string, payload: WebPushPayload): Promise<void> {
  if (!ensureVapidConfigured()) return;

  const subs = await query<PushSubscriptionRow>(
    `SELECT id, endpoint, p256dh, auth
     FROM push_subscriptions
     WHERE user_id = $1`,
    [userId],
  );
  if (!subs.rows.length) return;

  const body = JSON.stringify({
    title: payload.title,
    body: payload.body,
    url: payload.url,
    tag: payload.tag,
  });

  await Promise.all(
    subs.rows.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          body,
        );
      } catch (err) {
        if (isGoneSubscriptionError(err)) {
          await query(`DELETE FROM push_subscriptions WHERE endpoint = $1`, [sub.endpoint]);
        }
      }
    }),
  );
}

export async function savePushSubscription(params: {
  userId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent?: string | null;
}) {
  await query(
    `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (endpoint) DO UPDATE SET
       user_id = EXCLUDED.user_id,
       p256dh = EXCLUDED.p256dh,
       auth = EXCLUDED.auth,
       user_agent = EXCLUDED.user_agent`,
    [params.userId, params.endpoint, params.p256dh, params.auth, params.userAgent?.trim() || null],
  );
}

export async function removePushSubscription(params: { userId: string; endpoint: string }) {
  await query(`DELETE FROM push_subscriptions WHERE user_id = $1 AND endpoint = $2`, [
    params.userId,
    params.endpoint,
  ]);
}

export async function countPushSubscriptions(userId: string): Promise<number> {
  const result = await query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM push_subscriptions WHERE user_id = $1`,
    [userId],
  );
  return Number(result.rows[0]?.count ?? 0);
}
