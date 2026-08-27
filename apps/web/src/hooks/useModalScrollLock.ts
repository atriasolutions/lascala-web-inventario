import { useEffect } from 'react';

/** Contador para modales anidados (p. ej. Confirm sobre ficha). */
let lockCount = 0;
let prevBodyOverflow = '';
let prevMainOverflow = '';

function applyLock() {
  const body = document.body;
  const main = document.querySelector('.main-content') as HTMLElement | null;
  if (lockCount === 0) {
    prevBodyOverflow = body.style.overflow;
    prevMainOverflow = main?.style.overflow ?? '';
    body.classList.add('modal-scroll-lock');
    body.style.overflow = 'hidden';
    if (main) main.style.overflow = 'hidden';
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
  if (main) main.style.overflow = prevMainOverflow;
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
