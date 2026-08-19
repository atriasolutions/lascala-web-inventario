#!/usr/bin/env node
/**
 * Agrega los hallazgos de la suite responsive en un resumen priorizado.
 * Uso: npm run test:e2e:findings
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const DIR = resolve('test-results/responsive');
const OUT = resolve('test-results/responsive-findings.md');

let files = [];
try {
  files = readdirSync(DIR).filter((f) => f.endsWith('.json'));
} catch {
  console.error(`No hay resultados en ${DIR}. Corre primero: npm run test:e2e`);
  process.exit(1);
}

const findings = files.flatMap((f) => JSON.parse(readFileSync(resolve(DIR, f), 'utf8')).findings);

// Agrupa la misma regla + selector para no repetir un defecto por cada viewport.
const buckets = new Map();
for (const f of findings) {
  const key = `${f.severity}|${f.rule}|${f.selector}|${f.route}`;
  const hit = buckets.get(key);
  if (hit) hit.viewports.add(f.viewport);
  else buckets.set(key, { ...f, viewports: new Set([f.viewport]) });
}

const order = { P0: 0, P1: 1, P2: 2 };
const rows = [...buckets.values()].sort(
  (a, b) => order[a.severity] - order[b.severity] || a.route.localeCompare(b.route),
);

const counts = { P0: 0, P1: 0, P2: 0 };
for (const r of rows) counts[r.severity] += 1;

let md = `# Hallazgos responsive — Boutique L'Scala\n\n`;
md += `Rutas auditadas: ${new Set(findings.map((f) => f.route)).size} · `;
md += `Hallazgos únicos: ${rows.length} (P0 ${counts.P0} · P1 ${counts.P1} · P2 ${counts.P2})\n\n`;

for (const sev of ['P0', 'P1', 'P2']) {
  const list = rows.filter((r) => r.severity === sev);
  if (!list.length) continue;
  md += `## ${sev} (${list.length})\n\n`;
  for (const r of list) {
    md += `### ${r.route} — ${r.rule}\n`;
    md += `- Viewports: ${[...r.viewports].sort().join(', ')}\n`;
    md += `- Selector: \`${r.selector}\`${r.count ? ` (×${r.count} nodos)` : ''}\n`;
    md += `- Esperado: ${r.expected}\n`;
    md += `- Obtenido: ${String(r.actual).split('\n').join('\n  ')}\n\n`;
  }
}

writeFileSync(OUT, md);
console.log(md);
console.log(`\nGuardado en ${OUT}`);
