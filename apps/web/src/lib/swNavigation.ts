/** Mensaje del Service Worker → React Router (tap en notificación push). */
export const SW_NAVIGATE = 'lscala:navigate';

export function installServiceWorkerNavigation(navigate: (to: string) => void) {
  if (!('serviceWorker' in navigator)) return () => {};
  const onMessage = (event: MessageEvent) => {
    const data = event.data as { type?: string; url?: string } | null;
    if (data?.type !== SW_NAVIGATE || typeof data.url !== 'string') return;
    if (!data.url.startsWith('/')) return;
    navigate(data.url);
  };
  navigator.serviceWorker.addEventListener('message', onMessage);
  return () => navigator.serviceWorker.removeEventListener('message', onMessage);
}
