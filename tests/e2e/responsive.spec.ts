import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import { auditLayout, checkTarget, watchRuntime, type CtaResult, type Group } from './support/audit';
import type { Fixtures } from './support/global-setup';
import { ROUTES } from './support/routes';

const fixtures: Fixtures = JSON.parse(readFileSync(resolve('.playwright/fixtures.json'), 'utf8'));

const FINDINGS_DIR = resolve('test-results/responsive');
const SHOTS_DIR = resolve('test-results/screenshots');

type Finding = {
  severity: 'P0' | 'P1' | 'P2';
  rule: string;
  route: string;
  viewport: string;
  selector: string;
  expected: string;
  actual: string;
  count?: number;
};

function fmt(groups: Group[]) {
  return groups.map((g) => `  · ${g.selector} ×${g.count} — ${g.detail} — «${g.sample}»`).join('\n');
}

function ctaProblem(cta: CtaResult): string | null {
  if (!cta.checked) return null;
  if (!cta.found) return 'no se encontró el CTA en el DOM';
  if (!cta.visible) return 'el CTA no está visible';
  if (!cta.inViewport) return `el CTA queda fuera del viewport (rect ${JSON.stringify(cta.rect)})`;
  if (!cta.hittable) return `el CTA está tapado por ${cta.blockedBy}`;
  return null;
}

for (const route of ROUTES) {
  test(`responsive · ${route.name}`, async ({ page, browser }, testInfo) => {
    const viewportName = testInfo.project.name;
    const isMobile = viewportName.startsWith('mobile');
    const path = route.path(fixtures);
    test.skip(path === null, `Sin datos sembrados para ${route.name}: ruta no verificable.`);

    // El login se audita sin sesión: contexto limpio y mismo viewport del proyecto.
    let target = page;
    let ctx: Awaited<ReturnType<typeof browser.newContext>> | null = null;
    if (route.anonymous) {
      ctx = await browser.newContext({ ...testInfo.project.use, storageState: undefined });
      target = await ctx.newPage();
    }

    const runtime = watchRuntime(target);
    const findings: Finding[] = [];
    const push = (f: Omit<Finding, 'route' | 'viewport'>) =>
      findings.push({ ...f, route: route.name, viewport: viewportName });

    try {
      await target.goto(path!, { waitUntil: 'domcontentloaded' });
      if (route.ready) {
        await target.waitForSelector(route.ready, { timeout: 20_000 }).catch(() => null);
      }
      await target.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => null);

      if (route.prepare === 'tab-vouchers') {
        await target.getByRole('tab', { name: /cambios|voucher/i }).click();
        await target.waitForTimeout(600);
      }
      // Deja asentar animaciones de entrada antes de medir.
      await target.waitForTimeout(400);

      mkdirSync(`${SHOTS_DIR}/${viewportName}`, { recursive: true });
      await target.screenshot({
        path: `${SHOTS_DIR}/${viewportName}/${route.slug}.png`,
        fullPage: true,
      });

      const ctaSelector = isMobile ? route.cta?.mobile : route.cta?.desktop;
      const audit = await auditLayout(target, ctaSelector);

      if (audit.doc.overflowPx > 1) {
        push({
          severity: 'P0',
          rule: 'scroll-horizontal',
          selector: audit.overflowElements[0]?.selector || 'documentElement',
          expected: `scrollWidth ≤ clientWidth (${audit.doc.clientWidth}px)`,
          actual: `scrollWidth ${audit.doc.scrollWidth}px (+${audit.doc.overflowPx}px)\n${fmt(audit.overflowElements)}`,
        });
      }

      const ctaIssue = ctaProblem(audit.cta);
      if (ctaIssue) {
        push({
          severity: 'P0',
          rule: 'cta-inaccesible',
          selector: ctaSelector || '—',
          expected: 'CTA principal visible, dentro del viewport y clickeable',
          actual: ctaIssue,
        });
      }

      if (isMobile && !route.anonymous) {
        const bottomNav = await checkTarget(target, '.bottom-nav a.primary');
        const navIssue = ctaProblem(bottomNav);
        if (navIssue) {
          push({
            severity: 'P0',
            rule: 'bottom-nav-inaccesible',
            selector: '.bottom-nav a.primary',
            expected: 'El acceso a Caja de la bottom nav es clickeable',
            actual: navIssue,
          });
        }

        for (const g of audit.smallFontInputs) {
          push({
            severity: 'P1',
            rule: 'input-font-menor-16px',
            selector: g.selector,
            expected: 'font-size ≥ 16px (evita zoom automático en iOS)',
            actual: `${g.detail} — «${g.sample}»`,
            count: g.count,
          });
        }
      }

      // El mínimo de 44px aplica a interacción táctil: no se evalúa en el desktop de referencia.
      if (isMobile) {
        for (const g of audit.smallTargets.critical) {
          push({
            severity: 'P1',
            rule: 'target-tactil-menor-44px',
            selector: g.selector,
            expected: 'mínimo 44×44px',
            actual: `${g.detail} — «${g.sample}»`,
            count: g.count,
          });
        }
        for (const g of audit.smallTargets.minor) {
          push({
            severity: 'P2',
            rule: 'target-tactil-menor-44px (enlace en texto)',
            selector: g.selector,
            expected: 'mínimo 44×44px',
            actual: `${g.detail} — «${g.sample}»`,
            count: g.count,
          });
        }
      }
      for (const g of audit.clippedText) {
        push({
          severity: 'P2',
          rule: 'texto-recortado',
          selector: g.selector,
          expected: 'el texto cabe en su contenedor',
          actual: `${g.detail} — «${g.sample}»`,
          count: g.count,
        });
      }

      for (const e of [...runtime.pageErrors, ...runtime.consoleErrors]) {
        push({ severity: 'P0', rule: 'error-consola', selector: '—', expected: 'consola sin errores', actual: e });
      }
      for (const r of runtime.failedRequests) {
        push({ severity: 'P0', rule: 'request-fallido', selector: '—', expected: 'sin requests ≥400', actual: r });
      }

      mkdirSync(FINDINGS_DIR, { recursive: true });
      writeFileSync(
        `${FINDINGS_DIR}/${viewportName}__${route.slug}.json`,
        JSON.stringify(
          { route: route.name, slug: route.slug, viewport: viewportName, url: path, audit, runtime, findings },
          null,
          2,
        ),
      );

      const p0 = findings.filter((f) => f.severity === 'P0');
      const p1 = findings.filter((f) => f.severity === 'P1');
      const p2 = findings.filter((f) => f.severity === 'P2');
      const render = (list: Finding[]) =>
        list.map((f) => `[${f.severity}] ${f.rule} → ${f.selector}\n  esperado: ${f.expected}\n  obtenido: ${f.actual}`).join('\n');

      expect.soft(p0, `P0 en ${route.name} @ ${viewportName}\n${render(p0)}`).toHaveLength(0);
      expect.soft(p1, `P1 en ${route.name} @ ${viewportName}\n${render(p1)}`).toHaveLength(0);
      expect.soft(p2, `P2 en ${route.name} @ ${viewportName}\n${render(p2)}`).toHaveLength(0);
    } finally {
      await ctx?.close();
    }
  });
}
