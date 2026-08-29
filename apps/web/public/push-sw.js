/* Web Push handler — importado por el Service Worker de vite-plugin-pwa. */
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : '' };
  }

  const title = data.title || "L'Scala";
  const options = {
    body: data.body || '',
    icon: '/brand/pwa-192.png',
    badge: '/brand/pwa-192.png',
    tag: data.tag || 'lscala-operacion',
    data: { url: data.url || '/mermas' },
    renotify: true,
  };

  event.waitUntil(self.registration.showNotification(title, options));
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
