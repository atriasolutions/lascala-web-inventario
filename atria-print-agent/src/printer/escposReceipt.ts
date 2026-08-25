import { encodeCp850, ESC, ESC_POS_CODE_PAGE_CP850, GS } from './encodeCp850.js';
import { htmlToPlainText } from './htmlPrint.js';
import { buildEscPosWordmark, centerLine, LOGO_LINE_RE, WORDMARK_RE } from './escposLogo.js';

export { LOGO_LINE_RE, WORDMARK_RE, centerLine };
export { encodeCp850, encodeLatin1 } from './encodeCp850.js';

/**
 * Font A = 12 dots. 80 mm @ 203 dpi = 576 dots → 48 columnas.
 * 42 cols es ancho de 58 mm y deja ~1.5 cm vacíos a la derecha.
 */
export const RECEIPT_COLS_80MM = 48;
export const PRINT_AREA_DOTS_80MM = 576;

/** Tope amplio: comprobante + varios vouchers con corte. */
export const RECEIPT_MAX_LINES = 160;

/** Marcador de prepique (coincide con `- - - corte - - -` del front). */
export const CUT_LINE_RE = /^(?:-\s*)+corte(?:\s*-)+\s*$/i;

/**
 * Marcador de código de barras Code128 (el SVG del browser se descarta en texto).
 * Formato: [[[BARCODE:BC000123]]]
 */
export const BARCODE_LINE_RE = /^\[\[\[BARCODE:(.+?)\]\]\]$/i;

/** Líneas ESC d n (~3 mm c/u en fuente A). Solo en el corte, no alarga el cuerpo. */
export const CUT_FEED_BEFORE = 6;
export const CUT_FEED_AFTER = 2;
export const FINAL_FEED_BEFORE = 5;

const HEADER_END_RE = /^Folio:/i;
const BODY_LEFT_RE = /^C[oó]d:/i;
/** Etiquetas cortas sobre Code128 en voucher (ASCII, sin tilde). */
const BARCODE_CAPTION_RE = /^(Ticket|Prenda)$/i;

/**
 * Convierte HTML de comprobante L'Scala → bytes ESC/POS.
 */
export function htmlToEscPosReceipt(
  html: string,
  opts?: { widthMm?: number; maxLines?: number },
): Buffer {
  const widthMm = opts?.widthMm ?? 80;
  const cols = widthMm <= 58 ? 32 : RECEIPT_COLS_80MM;
  const maxLines = opts?.maxLines ?? RECEIPT_MAX_LINES;

  const plain = htmlToPlainText(html);
  if (!plain.trim()) {
    throw new Error('Comprobante vacío tras convertir HTML a texto');
  }

  let lines = wrapPlainText(plain, cols);
  lines = ensureBrandHeader(lines);
  lines = normalizeSeparators(lines, cols);
  if (lines.length > maxLines) {
    lines = lines.slice(0, maxLines);
    lines.push(centerLine('[…] comprobante truncado', cols));
  }

  return buildEscPosFromLines(lines, cols);
}

/** Job de prueba corto (~6 líneas + corte) — no gasta el rollo. */
export function buildEscPosSmokeTest(label = "L'Scala prueba"): Buffer {
  const cols = RECEIPT_COLS_80MM;
  const lines = [
    "L'SCALA",
    centerLine(label, cols),
    centerLine('Comprobante ESC/POS', cols),
    '-'.repeat(cols),
    'Si lees esto, la termica OK.',
    `Hora: ${new Date().toLocaleString('es-CL')}`,
    '-'.repeat(cols),
  ];
  return buildEscPosFromLines(lines, cols);
}

export function buildEscPosFromText(text: string): Buffer {
  return buildEscPosFromLines(text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n'));
}

export function ensureBrandHeader(lines: string[]): string[] {
  const cleaned = lines.filter((l) => !LOGO_LINE_RE.test(l.trim()));
  const top = cleaned.slice(0, 6).join('\n');
  if (WORDMARK_RE.test(cleaned[0]?.trim() || '') || /L['’`]?SCALA/i.test(top)) {
    return cleaned;
  }
  return ["L'SCALA", "BOUTIQUE L'SCALA SPA", ...cleaned];
}

export function normalizeSeparators(lines: string[], cols: number): string[] {
  return lines.map((line) => {
    const t = line.trim();
    if (/^-{8,}$/.test(t)) return '-'.repeat(cols);
    if (/^[·.]{8,}$/.test(t)) return '·'.repeat(cols);
    return line;
  });
}

export function buildEscPosFromLines(lines: string[], cols = RECEIPT_COLS_80MM): Buffer {
  const chunks: Buffer[] = [];
  chunks.push(Buffer.from([ESC, 0x40]));
  chunks.push(ESC_POS_CODE_PAGE_CP850);
  // Área 80 mm (576 dots) y margen 0 — por si el clone quedó en modo 58 mm
  chunks.push(Buffer.from([GS, 0x4c, 0x00, 0x00]));
  chunks.push(
    Buffer.from([GS, 0x57, PRINT_AREA_DOTS_80MM & 0xff, (PRINT_AREA_DOTS_80MM >> 8) & 0xff]),
  );
  chunks.push(Buffer.from([ESC, 0x61, 0x00])); // no fiarse de ESC a; centramos con espacios

  let inHeader = true;
  let buf: string[] = [];
  const flushText = () => {
    if (!buf.length) return;
    chunks.push(encodeCp850(buf.join('\n') + '\n'));
    buf = [];
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (CUT_LINE_RE.test(trimmed)) {
      flushText();
      chunks.push(Buffer.from([ESC, 0x64, CUT_FEED_BEFORE]));
      chunks.push(Buffer.from([GS, 0x56, 0x01]));
      chunks.push(Buffer.from([ESC, 0x64, CUT_FEED_AFTER]));
      inHeader = true;
      continue;
    }
    if (LOGO_LINE_RE.test(trimmed) || WORDMARK_RE.test(trimmed)) {
      flushText();
      chunks.push(buildEscPosWordmark(cols));
      inHeader = true;
      continue;
    }
    if (BARCODE_CAPTION_RE.test(trimmed)) {
      buf.push(centerLine(trimmed, cols));
      inHeader = false;
      continue;
    }
    const bc = trimmed.match(BARCODE_LINE_RE);
    if (bc) {
      flushText();
      chunks.push(buildEscPosCode128(bc[1].trim()));
      inHeader = false;
      continue;
    }
    if (HEADER_END_RE.test(trimmed) || BODY_LEFT_RE.test(trimmed)) {
      inHeader = false;
    }

    if (inHeader) {
      buf.push(centerLine(trimmed, cols));
    } else {
      buf.push(line);
    }
  }
  flushText();

  chunks.push(Buffer.from([ESC, 0x64, FINAL_FEED_BEFORE]));
  chunks.push(Buffer.from([GS, 0x56, 0x01]));
  return Buffer.concat(chunks);
}

/**
 * Code128 compacto + BC en una línea (sin double-width para ahorrar alto).
 */
export function buildEscPosCode128(data: string): Buffer {
  const code = data.replace(/[^\x20-\x7E]/g, '').slice(0, 48);
  if (!code) return Buffer.alloc(0);

  const chunks: Buffer[] = [];
  chunks.push(Buffer.from([ESC, 0x61, 0x01]));

  const payload = Buffer.from(code, 'ascii');
  chunks.push(Buffer.from([GS, 0x68, 28]));
  chunks.push(Buffer.from([GS, 0x77, 2]));
  chunks.push(Buffer.from([GS, 0x48, 0]));
  chunks.push(Buffer.from([GS, 0x6b, 73, payload.length]));
  chunks.push(payload);
  chunks.push(Buffer.from('\n'));
  chunks.push(encodeCp850(`${code}\n`));

  chunks.push(Buffer.from([ESC, 0x61, 0x00]));
  return Buffer.concat(chunks);
}

export function wrapPlainText(text: string, cols: number): string[] {
  const out: string[] = [];
  for (const rawLine of text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')) {
    const trimmed = rawLine.trim();
    if (CUT_LINE_RE.test(trimmed) || BARCODE_LINE_RE.test(trimmed) || LOGO_LINE_RE.test(trimmed)) {
      out.push(trimmed);
      continue;
    }
    if (/ {2,}/.test(rawLine) && rawLine.length <= cols) {
      out.push(rawLine.replace(/\s+$/g, ''));
      continue;
    }
    const line = rawLine.replace(/\t/g, ' ').trimEnd();
    if (!line) {
      out.push('');
      continue;
    }
    let rest = line.trimStart();
    while (rest.length > cols) {
      let breakAt = rest.lastIndexOf(' ', cols);
      if (breakAt < Math.floor(cols * 0.45)) breakAt = cols;
      out.push(rest.slice(0, breakAt).trimEnd());
      rest = rest.slice(breakAt).trimStart();
    }
    if (rest) out.push(rest);
  }
  return out;
}
