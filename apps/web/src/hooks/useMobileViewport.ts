import { useEffect, useState } from 'react';

/** Mismo corte que AppShell (.mobile-only / sidebar). */
export const MOBILE_MAX_WIDTH_PX = 900;

const QUERY = `(max-width: ${MOBILE_MAX_WIDTH_PX}px)`;

export function useMobileViewport() {
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(QUERY).matches : false,
  );

  useEffect(() => {
    const mq = window.matchMedia(QUERY);
    const sync = () => setIsMobile(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  return isMobile;
}
