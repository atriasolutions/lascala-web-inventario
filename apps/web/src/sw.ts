/// <reference lib="webworker" />
import { clientsClaim } from 'workbox-core';
import {
  cleanupOutdatedCaches,
  createHandlerBoundToURL,
  precacheAndRoute,
} from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { NetworkOnly } from 'workbox-strategies';

declare let self: ServiceWorkerGlobalScope;

precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

self.skipWaiting();
clientsClaim();

registerRoute(
  new NavigationRoute(createHandlerBoundToURL('/index.html'), {
    denylist: [/^\/api/, /^\/uploads/],
  }),
);

registerRoute(
  ({ url }) => url.pathname.startsWith('/api') || url.pathname.startsWith('/uploads'),
  new NetworkOnly(),
);

type PushPayload = {
  title?: string;
  body?: string;
  url?: string;
  tag?: string;
  notification?: { title?: string; body?: string };
};

function parsePushPayload(event: PushEvent): PushPayload {
  if (!event.data) return {};
  try {
    return event.data.json() as PushPayload;
  } catch {
    const text = event.data.text();
    return text ? { body: text } : {};
  }
}

function iconUrl() {
  return new URL('/brand/pwa-192.png', self.location.origin).href;
}

self.addEventListener('push', (event) => {
  const data = parsePushPayload(event);
  const title = data.title || data.notification?.title || "L'Scala";
  const body = data.body || data.notification?.body || '';
  const url = data.url || '/mermas';

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: iconUrl(),
      badge: iconUrl(),
      tag: data.tag || 'lscala-operacion',
      data: { url },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = event.notification.data?.url || '/';
  const path = target.startsWith('http') ? target : new URL(target, self.location.origin).href;

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.startsWith(self.location.origin) && 'focus' in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(path);
      return undefined;
    }),
  );
});
