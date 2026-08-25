import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { helpTipFor } from '../../lib/helpTips';
import { IconClose } from '../icons';

type TipSide = 'right' | 'left' | 'bottom' | 'top';

type TipState = {
  key: string;
  text: string;
  rect: { top: number; left: number; right: number; bottom: number; width: number; height: number };
  prefer: TipSide;
};

type HelpModeCtx = {
  active: boolean;
  setActive: (v: boolean) => void;
  toggle: () => void;
};

const HelpModeContext = createContext<HelpModeCtx | null>(null);

export function useHelpMode() {
  const ctx = useContext(HelpModeContext);
  if (!ctx) {
    return {
      active: false,
      setActive: (_v: boolean) => {},
      toggle: () => {},
    };
  }
  return ctx;
}

function preferSide(hit: HTMLElement, rect: DOMRect): TipSide {
  if (hit.closest('.sidebar')) return 'right';
  if (hit.closest('.bottom-nav')) return 'top';
  if (rect.left < 80) return 'right';
  return 'bottom';
}

function isCoarsePointer() {
  return typeof window !== 'undefined' && window.matchMedia('(max-width: 900px)').matches;
}

export function HelpModeBanner() {
  const { active, setActive } = useHelpMode();
  if (!active) return null;
  return (
    <div className="help-mode-banner" data-help-ignore role="status">
      <p>
        <strong>Modo ayuda:</strong>{' '}
        <span className="desktop-only">Pincha un menú o botón para ver qué hace. Esc o Salir para cerrar.</span>
        <span className="mobile-only">Toca un menú o botón resaltado para ver qué hace. Usa Salir para cerrar.</span>
      </p>
      <button type="button" className="btn ghost" onClick={() => setActive(false)}>
        Salir
      </button>
    </div>
  );
}

function HelpTipPopover({ tip, onClose }: { tip: TipState; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ left: 12, top: 12, side: tip.prefer, ready: false });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const pad = 12;
    const gap = 10;
    const tw = el.offsetWidth;
    const th = el.offsetHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const r = tip.rect;
    let side: TipSide = tip.prefer;
    let left = r.left;
    let top = r.top;

    if (side === 'right') {
      left = r.right + gap;
      top = r.top + r.height / 2 - th / 2;
      if (left + tw > vw - pad && r.left - gap - tw >= pad) {
        side = 'left';
        left = r.left - gap - tw;
      }
    } else if (side === 'left') {
      left = r.left - gap - tw;
      top = r.top + r.height / 2 - th / 2;
      if (left < pad) {
        side = 'right';
        left = r.right + gap;
      }
    } else if (side === 'top') {
      left = r.left + r.width / 2 - tw / 2;
      top = r.top - gap - th;
      if (top < pad) {
        side = 'bottom';
        top = r.bottom + gap;
      }
    } else {
      left = r.left + r.width / 2 - tw / 2;
      top = r.bottom + gap;
      if (top + th > vh - pad && r.top - gap - th >= pad) {
        side = 'top';
        top = r.top - gap - th;
      }
    }

    left = Math.min(Math.max(left, pad), Math.max(pad, vw - tw - pad));
    top = Math.min(Math.max(top, pad), Math.max(pad, vh - th - pad));
    setBox({ left, top, side, ready: true });
  }, [tip]);

  return (
    <div
      ref={ref}
      className={`help-tip-pop is-${box.side}`}
      data-help-ignore
      role="dialog"
      aria-label="Ayuda"
      style={{ left: box.left, top: box.top, visibility: box.ready ? 'visible' : 'hidden' }}
    >
      <button
        type="button"
        className="help-tip-close"
        aria-label="Cerrar ayuda"
        onClick={onClose}
      >
        <IconClose size={16} />
      </button>
      <p>{tip.text}</p>
    </div>
  );
}

export function HelpModeProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState(false);
  const [tip, setTip] = useState<TipState | null>(null);
  const tipRef = useRef<TipState | null>(null);
  tipRef.current = tip;

  const toggle = useCallback(() => {
    setActive((v) => !v);
  }, []);

  useEffect(() => {
    document.body.classList.toggle('help-mode', active);
    document.body.classList.toggle('help-mode-touch', active && isCoarsePointer());
    if (!active) setTip(null);
    return () => {
      document.body.classList.remove('help-mode');
      document.body.classList.remove('help-mode-touch');
    };
  }, [active]);

  useEffect(() => {
    if (!active) return;

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (tipRef.current) setTip(null);
        else setActive(false);
      }
    }

    function showTipFor(hit: HTMLElement) {
      const key = hit.getAttribute('data-help') || '';
      const rect = hit.getBoundingClientRect();
      setTip({
        key,
        text: helpTipFor(key),
        prefer: preferSide(hit, rect),
        rect: {
          top: rect.top,
          left: rect.left,
          right: rect.right,
          bottom: rect.bottom,
          width: rect.width,
          height: rect.height,
        },
      });
    }

    function onPointerCapture(e: Event) {
      const el = e.target as HTMLElement | null;
      if (!el) return;
      if (el.closest('[data-help-ignore]')) return;

      const hit = el.closest('[data-help]') as HTMLElement | null;
      if (!hit) {
        if (tipRef.current) {
          e.preventDefault();
          e.stopPropagation();
          setTip(null);
          return;
        }
        setActive(false);
        return;
      }

      e.preventDefault();
      e.stopPropagation();
      if (typeof (e as { stopImmediatePropagation?: () => void }).stopImmediatePropagation === 'function') {
        (e as { stopImmediatePropagation: () => void }).stopImmediatePropagation();
      }
      showTipFor(hit);
    }

    document.addEventListener('pointerdown', onPointerCapture, true);
    document.addEventListener('click', onPointerCapture, true);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointerCapture, true);
      document.removeEventListener('click', onPointerCapture, true);
      document.removeEventListener('keydown', onKey);
    };
  }, [active]);

  const value = useMemo(() => ({ active, setActive, toggle }), [active, toggle]);

  return (
    <HelpModeContext.Provider value={value}>
      {children}
      {active && tip ? (
        <HelpTipPopover key={tip.key} tip={tip} onClose={() => setTip(null)} />
      ) : null}
    </HelpModeContext.Provider>
  );
}
