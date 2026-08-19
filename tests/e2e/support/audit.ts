import type { Page } from '@playwright/test';

export type Group = {
  selector: string;
  count: number;
  sample: string;
  detail: string;
};

export type CtaResult =
  | { checked: false; reason: string }
  | {
      checked: true;
      found: boolean;
      visible: boolean;
      inViewport: boolean;
      hittable: boolean;
      rect: { x: number; y: number; width: number; height: number } | null;
      blockedBy: string | null;
    };

export type LayoutAudit = {
  viewport: { width: number; height: number };
  doc: { scrollWidth: number; clientWidth: number; overflowPx: number };
  overflowElements: Group[];
  smallTargets: { critical: Group[]; minor: Group[] };
  clippedText: Group[];
  smallFontInputs: Group[];
  cta: CtaResult;
};

export type RuntimeLog = {
  consoleErrors: string[];
  pageErrors: string[];
  failedRequests: string[];
};

/** Ruido conocido del entorno local que no es un defecto de la app. */
const IGNORED_RUNTIME = [
  /qz-?tray/i,
  /ws:\/\/localhost:87[0-9]{2}/i,
  /Download the React DevTools/i,
  /\[vite\] connect/i,
  /favicon\.ico/i,
];

export function isIgnorable(message: string) {
  return IGNORED_RUNTIME.some((re) => re.test(message));
}

/** Engancha los listeners antes de navegar; devuelve el acumulador vivo. */
export function watchRuntime(page: Page): RuntimeLog {
  const log: RuntimeLog = { consoleErrors: [], pageErrors: [], failedRequests: [] };
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    if (!isIgnorable(text)) log.consoleErrors.push(text);
  });
  page.on('pageerror', (err) => {
    const text = `${err.name}: ${err.message}`;
    if (!isIgnorable(text)) log.pageErrors.push(text);
  });
  page.on('response', (res) => {
    if (res.status() < 400) return;
    const text = `${res.status()} ${res.request().method()} ${res.url()}`;
    if (!isIgnorable(text)) log.failedRequests.push(text);
  });
  page.on('requestfailed', (req) => {
    const text = `FAILED ${req.method()} ${req.url()} (${req.failure()?.errorText || 'sin detalle'})`;
    if (!isIgnorable(text)) log.failedRequests.push(text);
  });
  return log;
}

/** Comprueba que un objetivo concreto esté visible, dentro del viewport y clickeable. */
export async function checkTarget(page: Page, selector: string): Promise<CtaResult> {
  return page.evaluate((sel) => {
    const el = document.querySelector<HTMLElement>(sel);
    if (!el) {
      return { checked: true, found: false, visible: false, inViewport: false, hittable: false, rect: null, blockedBy: null };
    }
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const r = el.getBoundingClientRect();
    const st = getComputedStyle(el);
    const vis = st.display !== 'none' && st.visibility !== 'hidden' && Number(st.opacity) !== 0 && r.width > 0 && r.height > 0;
    const inViewport = r.top >= -1 && r.left >= -1 && r.bottom <= vh + 1 && r.right <= vw + 1;
    const cx = Math.min(Math.max(r.left + r.width / 2, 1), vw - 1);
    const cy = Math.min(Math.max(r.top + r.height / 2, 1), vh - 1);
    const hit = document.elementFromPoint(cx, cy);
    const hittable = !!hit && (hit === el || el.contains(hit) || hit.contains(el));
    return {
      checked: true,
      found: true,
      visible: vis,
      inViewport,
      hittable,
      rect: { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) },
      blockedBy: hittable || !hit ? null : `${hit.tagName.toLowerCase()}${Array.from(hit.classList).slice(0, 3).map((c) => `.${c}`).join('')}`,
    };
  }, selector) as Promise<CtaResult>;
}

export async function auditLayout(page: Page, ctaSelector?: string): Promise<LayoutAudit> {
  return page.evaluate(
    ({ cta, minTarget }) => {
      const MIN = minTarget;
      const vw = window.innerWidth;
      const vh = window.innerHeight;

      function signature(el: Element): string {
        const tag = el.tagName.toLowerCase();
        const id = (el as HTMLElement).id ? `#${(el as HTMLElement).id}` : '';
        const cls = Array.from(el.classList)
          .filter((c) => !/^is-|^css-/.test(c))
          .slice(0, 3)
          .map((c) => `.${c}`)
          .join('');
        const role = el.getAttribute('role');
        const aria = el.getAttribute('aria-label');
        return `${tag}${id}${cls}${role ? `[role=${role}]` : ''}${aria ? `[aria-label="${aria.slice(0, 28)}"]` : ''}`;
      }

      function label(el: Element): string {
        const t = (el.textContent || '').replace(/\s+/g, ' ').trim();
        if (t) return t.slice(0, 48);
        const aria = el.getAttribute('aria-label');
        if (aria) return aria.slice(0, 48);
        const ph = (el as HTMLInputElement).placeholder;
        return ph ? `placeholder: ${ph.slice(0, 40)}` : '(sin texto)';
      }

      function visible(el: Element): boolean {
        const st = getComputedStyle(el);
        if (st.display === 'none' || st.visibility === 'hidden' || Number(st.opacity) === 0) return false;
        const r = el.getBoundingClientRect();
        // ≤1px cubre tanto lo colapsado como el patrón `.sr-only` (clip de 1×1).
        if (r.width <= 1 || r.height <= 1) return false;
        // Descartar contenidos dentro de paneles cerrados (sheets/modales fuera de pantalla).
        if (r.bottom < -vh || r.top > vh * 3) return false;
        return true;
      }

      type Raw = { sel: string; sample: string; detail: string };
      function group(rows: Raw[]) {
        const map = new Map<string, { selector: string; count: number; sample: string; detail: string }>();
        for (const r of rows) {
          const hit = map.get(r.sel);
          if (hit) hit.count += 1;
          else map.set(r.sel, { selector: r.sel, count: 1, sample: r.sample, detail: r.detail });
        }
        return Array.from(map.values()).sort((a, b) => b.count - a.count);
      }

      const all = Array.from(document.querySelectorAll<HTMLElement>('body *'));

      // 1. Desborde horizontal — culpables: elementos que exceden el ancho del viewport.
      const overflowRaw: Raw[] = [];
      for (const el of all) {
        if (!visible(el)) continue;
        const st = getComputedStyle(el);
        if (st.position === 'fixed') continue;
        const r = el.getBoundingClientRect();
        const over = Math.round(r.right - vw);
        if (over > 1 && r.width <= vw * 4) {
          const parent = el.parentElement;
          const parentOver = parent ? Math.round(parent.getBoundingClientRect().right - vw) : 0;
          if (parentOver > 1 && parent && getComputedStyle(parent).overflowX === 'visible') continue;
          overflowRaw.push({ sel: signature(el), sample: label(el), detail: `+${over}px fuera del viewport` });
        }
      }

      // 2. Objetivos táctiles < 44px.
      const interactiveSel =
        'button, a[href], input:not([type=hidden]), select, textarea, summary, [role=button], [role=tab], [role=link], [role=switch], [role=checkbox], [role=menuitem], [tabindex]:not([tabindex="-1"])';
      const critical: Raw[] = [];
      const minor: Raw[] = [];
      for (const el of Array.from(document.querySelectorAll<HTMLElement>(interactiveSel))) {
        if (!visible(el)) continue;
        if ((el as HTMLInputElement).disabled) continue;
        const type = (el as HTMLInputElement).type;
        if (type === 'checkbox' || type === 'radio') {
          // El área efectiva suele ser el <label> contenedor; se evalúa ese.
          continue;
        }
        const r = el.getBoundingClientRect();
        const min = Math.min(r.width, r.height);
        if (min >= MIN - 0.5) continue;
        const row: Raw = {
          sel: signature(el),
          sample: label(el),
          detail: `${Math.round(r.width)}×${Math.round(r.height)}px`,
        };
        const inNav = !!el.closest('.bottom-nav, .mobile-header, .topbar-desktop, .sidebar, .more-sheet');
        // Enlaces de texto (no botonizados, fuera de navegación) son P2: WCAG los exceptúa.
        const isTextLink = el.tagName === 'A' && !el.classList.contains('btn') && !inNav;
        if (isTextLink) minor.push(row);
        else critical.push(row);
      }

      // 3. Texto recortado por overflow hidden / ellipsis.
      const clippedRaw: Raw[] = [];
      for (const el of all) {
        if (!visible(el)) continue;
        const st = getComputedStyle(el);
        const clips = st.overflowX === 'hidden' || st.overflowX === 'clip' || st.textOverflow === 'ellipsis';
        if (!clips) continue;
        const text = (el.textContent || '').trim();
        if (!text) continue;
        const hasElementChildren = el.children.length > 0;
        if (hasElementChildren && st.textOverflow !== 'ellipsis') continue;
        const diff = el.scrollWidth - el.clientWidth;
        if (diff > 1) {
          clippedRaw.push({
            sel: signature(el),
            sample: label(el),
            detail: `scrollWidth ${el.scrollWidth} > clientWidth ${el.clientWidth} (+${diff}px)`,
          });
        }
      }

      // 4. Campos de texto con font-size < 16px (zoom automático en iOS).
      const smallFontRaw: Raw[] = [];
      const TEXT_ENTRY = ['', 'text', 'email', 'password', 'search', 'tel', 'url', 'number', 'date', 'datetime-local', 'time'];
      for (const el of Array.from(
        document.querySelectorAll<HTMLElement>('input:not([type=hidden]), select, textarea'),
      )) {
        if (!visible(el)) continue;
        if (el.tagName === 'INPUT' && !TEXT_ENTRY.includes((el as HTMLInputElement).type)) continue;
        const fs = parseFloat(getComputedStyle(el).fontSize);
        if (fs < 15.95) {
          smallFontRaw.push({ sel: signature(el), sample: label(el), detail: `font-size ${fs}px` });
        }
      }

      // 5. CTA principal accesible (no tapado por barras fijas).
      let ctaResult: unknown = { checked: false, reason: 'sin CTA declarado para la ruta' };
      if (cta) {
        // `text=Etiqueta` busca el botón/enlace por su texto; si no, es un selector CSS.
        const el = cta.startsWith('text=')
          ? (Array.from(document.querySelectorAll<HTMLElement>('button, a')).find(
              (n) => (n.textContent || '').replace(/\s+/g, ' ').trim() === cta.slice(5),
            ) ?? null)
          : document.querySelector<HTMLElement>(cta);
        if (!el) {
          ctaResult = { checked: true, found: false, visible: false, inViewport: false, hittable: false, rect: null, blockedBy: null };
        } else {
          const r = el.getBoundingClientRect();
          const vis = visible(el);
          const inViewport = r.top >= -1 && r.left >= -1 && r.bottom <= vh + 1 && r.right <= vw + 1;
          const cx = Math.min(Math.max(r.left + r.width / 2, 1), vw - 1);
          const cy = Math.min(Math.max(r.top + r.height / 2, 1), vh - 1);
          const hit = document.elementFromPoint(cx, cy);
          const hittable = !!hit && (hit === el || el.contains(hit) || hit.contains(el));
          ctaResult = {
            checked: true,
            found: true,
            visible: vis,
            inViewport,
            hittable,
            rect: { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) },
            blockedBy: hittable || !hit ? null : signature(hit),
          };
        }
      }

      return {
        viewport: { width: vw, height: vh },
        doc: {
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
          overflowPx: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        },
        overflowElements: group(overflowRaw).slice(0, 12),
        smallTargets: { critical: group(critical).slice(0, 20), minor: group(minor).slice(0, 10) },
        clippedText: group(clippedRaw).slice(0, 12),
        smallFontInputs: group(smallFontRaw).slice(0, 12),
        cta: ctaResult,
      } as unknown as LayoutAudit;
    },
    { cta: ctaSelector || null, minTarget: 44 },
  );
}
