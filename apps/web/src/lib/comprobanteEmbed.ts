/**
 * Embebe URL de comprobante en un campo TEXT ya existente (notes / description),
 * sin migración. Formato: última línea `[comprobante]:/ruta`
 */

const MARKER = '[comprobante]:';
const MARKER_RE = /\n?\[comprobante\]:(\S+)\s*$/;

export function packComprobante(text: string, url: string | null | undefined): string {
  const base = String(text ?? '')
    .replace(MARKER_RE, '')
    .trimEnd();
  const u = (url || '').trim();
  if (!u) return base;
  return base ? `${base}\n${MARKER}${u}` : `${MARKER}${u}`;
}

export function unpackComprobante(raw: string | null | undefined): {
  text: string;
  url: string;
} {
  const s = String(raw ?? '');
  const m = s.match(MARKER_RE);
  if (!m || m.index == null) return { text: s, url: '' };
  return {
    text: s.slice(0, m.index).trimEnd(),
    url: m[1] || '',
  };
}
