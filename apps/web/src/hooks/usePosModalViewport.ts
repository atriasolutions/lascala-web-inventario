import { type RefObject, useEffect } from 'react';

const SCROLL_BODY_SEL = [
  '.prod-modal-body',
  '.ing-line-modal-body',
  '.ing-filters-sheet-body',
  '.ing-nb-body',
  '.merma-form-body',
  '.gasto-form-body',
  '.admin-sheet-form',
  '.st-adjust-body',
  '.sales-detail-scroll',
  '.print-reminder-body',
  '.prod-filter-fields',
].join(', ');

/**
 * Ancla el overlay PosModal al visualViewport (iOS teclado) y scrollea
 * solo el body interno hacia el input enfocado — sin desplazar el panel entero.
 */
export function usePosModalViewport(
  active: boolean,
  rootRef: RefObject<HTMLElement | null>,
) {
  useEffect(() => {
    if (!active) return;
    const root = rootRef.current;
    if (!root) return;

    const vv = window.visualViewport;

    const syncViewport = () => {
      if (!vv) {
        root.style.removeProperty('--vv-top');
        root.style.removeProperty('--vv-left');
        root.style.removeProperty('--vv-height');
        root.style.removeProperty('--vv-width');
        return;
      }
      root.style.setProperty('--vv-top', `${vv.offsetTop}px`);
      root.style.setProperty('--vv-left', `${vv.offsetLeft}px`);
      root.style.setProperty('--vv-height', `${vv.height}px`);
      root.style.setProperty('--vv-width', `${vv.width}px`);
    };

    const scrollFieldIntoBody = (target: HTMLElement) => {
      const bodies = root.querySelectorAll(SCROLL_BODY_SEL);
      let scroller: HTMLElement | null = null;
      for (const node of bodies) {
        if (node.contains(target)) {
          scroller = node as HTMLElement;
          break;
        }
      }
      if (!scroller) {
        const panel = target.closest('.pos-modal-panel') as HTMLElement | null;
        if (panel && panel.scrollHeight > panel.clientHeight) scroller = panel;
      }
      if (!scroller) return;

      const t = target.getBoundingClientRect();
      const s = scroller.getBoundingClientRect();
      const pad = 20;
      if (t.bottom > s.bottom - pad) {
        scroller.scrollTop += t.bottom - (s.bottom - pad);
      } else if (t.top < s.top + pad) {
        scroller.scrollTop -= s.top + pad - t.top;
      }
    };

    const onFocusIn = (e: FocusEvent) => {
      const target = e.target;
      if (!(target instanceof HTMLElement)) return;
      if (!root.contains(target)) return;
      if (!/^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;

      // Esperar animación del teclado iOS + sync de visualViewport
      window.setTimeout(() => {
        syncViewport();
        scrollFieldIntoBody(target);
      }, 80);
      window.setTimeout(() => {
        syncViewport();
        scrollFieldIntoBody(target);
      }, 320);
    };

    syncViewport();
    vv?.addEventListener('resize', syncViewport);
    vv?.addEventListener('scroll', syncViewport);
    root.addEventListener('focusin', onFocusIn);

    return () => {
      vv?.removeEventListener('resize', syncViewport);
      vv?.removeEventListener('scroll', syncViewport);
      root.removeEventListener('focusin', onFocusIn);
      root.style.removeProperty('--vv-top');
      root.style.removeProperty('--vv-left');
      root.style.removeProperty('--vv-height');
      root.style.removeProperty('--vv-width');
    };
  }, [active, rootRef]);
}
