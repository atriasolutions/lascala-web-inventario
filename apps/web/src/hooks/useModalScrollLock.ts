import { useEffect } from 'react';

/** Contador para modales anidados (p. ej. Confirm sobre ficha). */
let lockCount = 0;
let prevBodyOverflow = '';
let prevBodyPosition = '';
let prevBodyTop = '';
let prevBodyWidth = '';
let prevMainOverflow = '';
let prevMainTouchAction = '';
let scrollY = 0;

function applyLock() {
  const body = document.body;
  const main = document.querySelector('.main-content') as HTMLElement | null;
  if (lockCount === 0) {
    scrollY = window.scrollY || window.pageYOffset || 0;
    prevBodyOverflow = body.style.overflow;
    prevBodyPosition = body.style.position;
    prevBodyTop = body.style.top;
    prevBodyWidth = body.style.width;
    prevMainOverflow = main?.style.overflow ?? '';
    prevMainTouchAction = main?.style.touchAction ?? '';

    body.classList.add('modal-scroll-lock');
    body.style.overflow = 'hidden';
    /* iOS Safari: overflow:hidden solo no basta; fijar body evita scroll del fondo */
    body.style.position = 'fixed';
    body.style.top = `-${scrollY}px`;
    body.style.width = '100%';

    if (main) {
      main.style.overflow = 'hidden';
      /* No touch-action:none — bloqueaba taps en X/Cancelar del modal en iOS */
    }
  }
  lockCount += 1;
}

function releaseLock() {
  lockCount = Math.max(0, lockCount - 1);
  if (lockCount > 0) return;
  const body = document.body;
  const main = document.querySelector('.main-content') as HTMLElement | null;
  body.classList.remove('modal-scroll-lock');
  body.style.overflow = prevBodyOverflow;
  body.style.position = prevBodyPosition;
  body.style.top = prevBodyTop;
  body.style.width = prevBodyWidth;
  if (main) {
    main.style.overflow = prevMainOverflow;
    main.style.touchAction = prevMainTouchAction;
  }
  window.scrollTo(0, scrollY);
}

/**
 * Bloquea scroll de la página detrás del modal (body + `.main-content`).
 * Obligatorio en iOS: sin esto el gesto scrollea el fondo y no el panel.
 */
export function useModalScrollLock(locked: boolean) {
  useEffect(() => {
    if (!locked) return;
    applyLock();
    return () => releaseLock();
  }, [locked]);
}
