import { api } from './api';

const DISMISS_KEY = 'lscala_push_banner_dismissed_v1';

export type PushSubscribeResult =
  | 'subscribed'
  | 'denied'
  | 'unsupported'
  | 'ios-need-install'
  | 'server-disabled'
  | 'error';

export type PushSupportState = {
  supported: boolean;
  standalone: boolean;
  permission: NotificationPermission | 'unsupported';
  iosNeedInstall: boolean;
};

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return output;
}

export function isStandalonePwa() {
  if (typeof window === 'undefined') return false;
  const mq = window.matchMedia('(display-mode: standalone)').matches;
  const iosStandalone =
    'standalone' in navigator &&
    Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
  return mq || iosStandalone;
}

export function isIosSafari() {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  const iOS =
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const webkit = /WebKit/.test(ua);
  const notChrome = !/CriOS|FxiOS|EdgiOS/.test(ua);
  return iOS && webkit && notChrome;
}

export function getPushSupportState(): PushSupportState {
  const supported =
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window;
  const standalone = isStandalonePwa();
  const iosNeedInstall = isIosSafari() && !standalone;
  return {
    supported,
    standalone,
    permission: supported ? Notification.permission : 'unsupported',
    iosNeedInstall,
  };
}

export function isPushBannerDismissed() {
  try {
    return localStorage.getItem(DISMISS_KEY) === '1';
  } catch {
    return false;
  }
}

export function dismissPushBanner() {
  try {
    localStorage.setItem(DISMISS_KEY, '1');
  } catch {
    /* ignore */
  }
}

export async function fetchPushServerStatus() {
  return api<{ enabled: boolean; subscriptions: number }>('/api/push/status');
}

export async function subscribeToPushAlerts(): Promise<PushSubscribeResult> {
  const support = getPushSupportState();
  if (!support.supported) return 'unsupported';
  if (support.iosNeedInstall) return 'ios-need-install';

  const keyRes = await api<{ publicKey: string | null; enabled: boolean }>(
    '/api/push/vapid-public-key',
  );
  if (!keyRes.enabled || !keyRes.publicKey) return 'server-disabled';

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return 'denied';

  const registration = await navigator.serviceWorker.ready;
  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(keyRes.publicKey),
    });
  }

  const json = subscription.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return 'error';

  await api('/api/push/subscribe', {
    method: 'POST',
    body: {
      endpoint: json.endpoint,
      keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
    },
  });

  return 'subscribed';
}

export async function unsubscribeFromPushAlerts(): Promise<boolean> {
  if (!('serviceWorker' in navigator)) return false;
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return true;

  const endpoint = subscription.endpoint;
  await api('/api/push/unsubscribe', {
    method: 'POST',
    body: { endpoint },
  });
  await subscription.unsubscribe();
  return true;
}

export async function syncExistingPushSubscription(): Promise<void> {
  const support = getPushSupportState();
  if (!support.supported || support.iosNeedInstall) return;
  if (Notification.permission !== 'granted') return;

  const keyRes = await api<{ publicKey: string | null; enabled: boolean }>(
    '/api/push/vapid-public-key',
  );
  if (!keyRes.enabled || !keyRes.publicKey) return;

  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return;

  const json = subscription.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return;

  await api('/api/push/subscribe', {
    method: 'POST',
    body: {
      endpoint: json.endpoint,
      keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
    },
  });
}
