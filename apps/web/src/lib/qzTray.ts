/**
 * Integración QZ Tray (Mac / Windows).
 *
 * Etiquetas XP-420B: TSPL raw (SIZE 50×25 + BARCODE + PRINT n,1 en un solo qz.print).
 * Comprobantes: HTML pixel 80 mm.
 * Confianza: cert+firma desde /qz-signing/ (demo QZ) para dejar de ser “anonymous”.
 */

import JsBarcode from 'jsbarcode';
import { KEYUTIL, KJUR, hextorstr, stob64 } from 'jsrsasign';
import qz from 'qz-tray';
import {
  QZ_TRAY_ENABLED,
  getProfile,
  loadPrintPrefs,
  type PrintProfileId,
} from './printPrefs';

export type QzStatus = 'idle' | 'connecting' | 'connected' | 'unavailable';
export type QzTrustMode = 'signed' | 'anonymous' | 'unknown';

let securityReady = false;
let connectPromise: Promise<void> | null = null;
let trustMode: QzTrustMode = 'unknown';

const CERT_URL = '/qz-signing/digital-certificate.txt';
const KEY_URL = '/qz-signing/private-key.pem';

export function getQzTrustMode(): QzTrustMode {
  return trustMode;
}

async function fetchText(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return null;
    const text = (await res.text()).trim();
    return text || null;
  } catch {
    return null;
  }
}

function looksLikePemCert(text: string) {
  return /BEGIN CERTIFICATE/.test(text);
}

function looksLikePemKey(text: string) {
  return /BEGIN (?:RSA )?PRIVATE KEY/.test(text);
}

function ensureSecurity() {
  if (securityReady) return;
  securityReady = true;

  /**
   * Firma = opcional.
   * Con cert+key válidos → Firmado (menos diálogos Allow).
   * Sin ellos o si la firma falla → anonymous, pero QZ sigue imprimiendo.
   * Nunca reject en signature: eso abortaba el job y caía al navegador.
   */
  qz.security.setCertificatePromise((resolve) => {
    void (async () => {
      const [cert, key] = await Promise.all([fetchText(CERT_URL), fetchText(KEY_URL)]);
      if (cert && key && looksLikePemCert(cert) && looksLikePemKey(key)) {
        trustMode = 'signed';
        resolve(cert);
        return;
      }
      trustMode = 'anonymous';
      resolve(null as unknown as string);
    })();
  });

  try {
    qz.security.setSignatureAlgorithm?.('SHA512');
  } catch {
    /* QZ < 2.1 */
  }

  qz.security.setSignaturePromise((toSign) => (resolve) => {
    void (async () => {
      const [cert, pem] = await Promise.all([fetchText(CERT_URL), fetchText(KEY_URL)]);
      if (!cert || !pem || !looksLikePemCert(cert) || !looksLikePemKey(pem)) {
        trustMode = 'anonymous';
        resolve(undefined as unknown as string);
        return;
      }
      try {
        const key = KEYUTIL.getKey(pem);
        const sig = new KJUR.crypto.Signature({ alg: 'SHA512withRSA' });
        sig.init(key);
        sig.updateString(toSign);
        const hex = sig.sign();
        trustMode = 'signed';
        resolve(stob64(hextorstr(hex)));
      } catch {
        trustMode = 'anonymous';
        resolve(undefined as unknown as string);
      }
    })();
  });
}

export function isQzFeatureEnabled() {
  return QZ_TRAY_ENABLED;
}

export function isQzConnected() {
  try {
    return Boolean(qz.websocket?.isActive?.());
  } catch {
    return false;
  }
}

export async function connectQz(): Promise<void> {
  if (!QZ_TRAY_ENABLED) {
    throw new Error('La impresión directa no está disponible en esta versión');
  }
  ensureSecurity();
  if (isQzConnected()) return;

  if (connectPromise) {
    try {
      await connectPromise;
    } catch {
      /* se reintenta abajo */
    }
    if (isQzConnected()) return;
    connectPromise = null;
  }

  connectPromise = qz.websocket
    .connect({ retries: 2, delay: 0.5 })
    .then(() => undefined)
    .catch((err: unknown) => {
      connectPromise = null;
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(
        msg.toLowerCase().includes('connect') || msg.toLowerCase().includes('unable')
          ? 'Atria Print Agent no está corriendo o no respondió. Ábrelo en este computador e intenta de nuevo.'
          : msg || 'No se pudo conectar con la impresión de este computador',
      );
    });

  await connectPromise;
}

export async function disconnectQz() {
  connectPromise = null;
  if (!isQzConnected()) return;
  try {
    await qz.websocket.disconnect();
  } catch {
    /* ignore */
  }
}

/** Lista nombres de impresoras del SO vía QZ. */
export async function listQzPrinters(): Promise<string[]> {
  await connectQz();
  const found = await qz.printers.find();
  if (Array.isArray(found)) {
    return found
      .map((p) => (typeof p === 'string' ? p : String((p as { name?: string }).name || p)))
      .filter(Boolean);
  }
  if (typeof found === 'string' && found) return [found];
  return [];
}

export async function probeQzSigningAssets(): Promise<{ hasCert: boolean; hasKey: boolean }> {
  const [cert, key] = await Promise.all([fetchText(CERT_URL), fetchText(KEY_URL)]);
  return {
    hasCert: Boolean(cert && looksLikePemCert(cert)),
    hasKey: Boolean(key && looksLikePemKey(key)),
  };
}

/** Mensajes claros (Chile); no exponer “Failed to sign” al usuario. */
function humanizeQzError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err || 'Error de impresión');
  const lower = raw.toLowerCase();
  if (lower.includes('sign') || lower.includes('certificate') || lower.includes('firma')) {
    return 'No se autorizó la impresión. Revisa que Atria Print Agent esté abierto';
  }
  if (
    lower.includes('websocket') ||
    lower.includes('connect') ||
    lower.includes('unable to establish') ||
    lower.includes('connection')
  ) {
    return 'Atria Print Agent no está abierto o no responde. Ábrelo e inténtalo de nuevo';
  }
  if (lower.includes('printer') || lower.includes('impresora')) {
    return raw.includes('asignada') ? raw : 'No se encontró esa impresora en este computador';
  }
  return raw;
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Fuentes TSPL built-in no manejan bien tildes → ASCII seguro. */
function toTsplSafe(s: string) {
  return s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[^\x20-\x7E]/g, ' ')
    .replace(/"/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/** 50×25 mm @ 203 dpi → dots. Márgenes laterales ~2.5 mm. */
const LABEL_DPI = 203;
const LABEL_W_DOTS = Math.round((50 / 25.4) * LABEL_DPI); // ≈ 400
const LABEL_H_DOTS = Math.round((25 / 25.4) * LABEL_DPI); // ≈ 200
const LABEL_MARGIN = Math.round((2.5 / 25.4) * LABEL_DPI); // ≈ 20
const LABEL_USABLE = LABEL_W_DOTS - LABEL_MARGIN * 2;

/** Font "2" 1×1 ≈ 12–14 dots/char (holgura para no correr texto a la derecha). */
const FONT2_CHAR_W = 14;
/** Font "1" 1×1 ≈ 8–10 dots/char */
const FONT1_CHAR_W = 10;
const FONT1_CHAR_H = 14;

function centerX(contentWidthDots: number) {
  const w = Math.min(Math.max(0, contentWidthDots), LABEL_W_DOTS);
  return Math.max(0, Math.floor((LABEL_W_DOTS - w) / 2));
}

/**
 * Parte el nombre en hasta 2 líneas por ancho útil.
 * Si no cabe, la última línea termina en "...".
 */
function splitNameLines(name: string, maxLines = 2): string[] {
  const maxChars = Math.floor(LABEL_USABLE / FONT2_CHAR_W);
  const words = name.split(/\s+/).filter(Boolean);
  if (!words.length) return ["Boutique L'Scala"];

  const lines: string[] = [];
  let cur = '';
  let i = 0;
  while (i < words.length) {
    const w = words[i];
    const trial = cur ? `${cur} ${w}` : w;
    if (trial.length <= maxChars) {
      cur = trial;
      i += 1;
      continue;
    }
    if (cur) {
      lines.push(cur);
      cur = '';
      if (lines.length >= maxLines) break;
      continue;
    }
    lines.push(`${w.slice(0, Math.max(1, maxChars - 3))}...`);
    i += 1;
    if (lines.length >= maxLines) break;
  }
  if (cur && lines.length < maxLines) {
    lines.push(cur);
    cur = '';
  }
  if ((i < words.length || cur) && lines.length) {
    const last = lines[lines.length - 1].replace(/\.\.\.$/, '');
    lines[lines.length - 1] = `${last.slice(0, Math.max(1, maxChars - 3))}...`;
  }
  return lines.slice(0, maxLines);
}

/**
 * Ancho dibujado Code128 en dots (TSPL BARCODE "128").
 * Módulos: Start(11) + data*11 + Check(11) + Stop(13).
 * Sin quiet zone: el firmware las deja fuera del trazo; incluirlas
 * sobrestimaba el ancho y corría el barcode a la izquierda.
 */
function estimateCode128Width(code: string, narrow: number) {
  const modules = 11 * (code.length + 2) + 13;
  return modules * narrow;
}

/**
 * Comandos TSPL/TSPL2 para Xprinter XP-420B.
 * Centrado H: x = (labelW - contentW) / 2
 * Centrado V: bloque nombre+barcode+código centrado en ~200 dots.
 * Un solo job: PRINT n,1.
 */
export function buildLabelTspl(name: string, code: string, copies = 1): string {
  const safeName = toTsplSafe(name.trim() || "Boutique L'Scala");
  const safeCode = toTsplSafe(code.trim() || '0').slice(0, 40);
  const lines = splitNameLines(safeName, 2);
  const n = Math.max(1, Math.min(999, Math.floor(Number(copies) || 1)));

  const lineH = 22;
  const nameH = lines.length * lineH;
  const gapNameBar = 6;
  const gapBarCode = 4;

  let narrow = 2;
  let wide = 4;
  let barW = estimateCode128Width(safeCode, narrow);
  const maxBarW = LABEL_W_DOTS - LABEL_MARGIN * 2;
  if (barW > maxBarW) {
    narrow = 1;
    wide = 2;
    barW = estimateCode128Width(safeCode, narrow);
  }
  barW = Math.min(barW, maxBarW);

  const barcodeH = lines.length > 1 ? 68 : 82;
  const codeH = FONT1_CHAR_H;
  const totalH = nameH + gapNameBar + barcodeH + gapBarCode + codeH;
  const startY = Math.max(6, Math.floor((LABEL_H_DOTS - totalH) / 2));

  const nameCmds = lines.map((line, i) => {
    const textW = line.length * FONT2_CHAR_W;
    const x = centerX(textW);
    const y = startY + i * lineH;
    return `TEXT ${x},${y},"2",0,1,1,"${line}"`;
  });

  const barX = centerX(barW);
  const barcodeY = startY + nameH + gapNameBar;
  const codeX = centerX(safeCode.length * FONT1_CHAR_W);
  const codeY = barcodeY + barcodeH + gapBarCode;

  const cmds = [
    'SIZE 50 mm,25 mm',
    'GAP 2 mm,0',
    'DIRECTION 1',
    'REFERENCE 0,0',
    'SET TEAR ON',
    'CLS',
    ...nameCmds,
    `BARCODE ${barX},${barcodeY},"128",${barcodeH},0,0,${narrow},${wide},"${safeCode}"`,
    `TEXT ${codeX},${codeY},"1",0,1,1,"${safeCode}"`,
    `PRINT ${n},1`,
  ];
  return `${cmds.join('\r\n')}\r\n`;
}

/** HTML solo para fallback window.print() (navegador). */
export function buildLabelHtml(name: string, code: string): string {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  try {
    JsBarcode(svg, code.trim(), {
      format: 'CODE128',
      width: 1.6,
      height: 48,
      displayValue: false,
      margin: 0,
    });
  } catch {
    /* ignore */
  }
  const barcode = svg.outerHTML || '';
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"/>
<style>
  @page { size: 50mm 25mm; margin: 0; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { width: 50mm; height: 25mm; overflow: hidden; }
  body {
    font-family: Helvetica, Arial, sans-serif;
    color: #000;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.8mm;
    padding: 1mm 1.5mm;
  }
  .name {
    font-size: 9pt;
    font-weight: 700;
    line-height: 1.15;
    text-align: center;
    max-height: 2.3em;
    overflow: hidden;
  }
  .bars { width: 46mm; text-align: center; }
  .bars svg { width: 100%; height: auto; }
  .code { font-size: 8pt; font-weight: 700; letter-spacing: 0.04em; }
</style></head>
<body>
  <div class="name">${escapeHtml(name.trim() || "Boutique L'Scala")}</div>
  <div class="bars">${barcode}</div>
  <div class="code">${escapeHtml(code.trim())}</div>
</body></html>`;
}

/** Envuelve markup ya renderizado (comprobante) para QZ. */
export function wrapReceiptHtml(innerHtml: string): string {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"/>
<style>
  * { box-sizing: border-box; }
  html, body {
    margin: 0;
    padding: 0;
    width: 76mm;
    background: #fff;
    color: #111;
    font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
  }
  img { max-width: 100%; }
</style></head>
<body>${innerHtml}</body></html>`;
}

function receiptConfig(printerName: string) {
  return qz.configs.create(printerName, {
    units: 'mm',
    size: { width: 80 },
    margins: 0,
    scaleContent: true,
    rasterize: true,
    interpolation: 'nearest-neighbor',
    density: 203,
  });
}

/** Serializa impresiones: evita 2× Allow / 2× PRINT N (doble clic o carrera). */
let labelPrintChain: Promise<unknown> = Promise.resolve();
let labelPrintBusy = false;
let lastLabelPrintKey = '';
let lastLabelPrintAt = 0;

/** Etiqueta vía TSPL raw → un solo qz.print con PRINT n,1. */
export async function printLabelTsplViaQz(
  name: string,
  code: string,
  printerNameOverride?: string,
  copies = 1,
): Promise<string> {
  const n = Math.max(1, Math.min(999, Math.floor(Number(copies) || 1)));
  const key = `${name.trim()}|${code.trim()}|${n}`;
  const now = Date.now();
  // Dedup ventana corta (doble clic / Strict Mode / create+print)
  if (labelPrintBusy || (key === lastLabelPrintKey && now - lastLabelPrintAt < 3000)) {
    const printer = (printerNameOverride || getProfile('labels').printerName).trim();
    return printer || 'impresora';
  }

  const run = async () => {
    labelPrintBusy = true;
    lastLabelPrintKey = key;
    lastLabelPrintAt = Date.now();
    try {
      await connectQz();
      const printer = (printerNameOverride || getProfile('labels').printerName).trim();
      if (!printer) {
        throw new Error('No hay impresora de etiquetas asignada. Configúrala en Ajustes.');
      }
      const tspl = buildLabelTspl(name, code, n);
      // Un solo job: N copias las resuelve PRINT n,1 (no loop de qz.print).
      const config = qz.configs.create(printer, { forceRaw: true, encoding: null });
      await qz.print(config, [
        {
          type: 'raw',
          format: 'command',
          flavor: 'plain',
          data: tspl,
        },
      ]);
      return printer;
    } finally {
      labelPrintBusy = false;
    }
  };

  const job = labelPrintChain.then(run, run);
  labelPrintChain = job.then(
    () => undefined,
    () => undefined,
  );
  return job;
}

export async function printHtmlViaQz(
  profile: PrintProfileId,
  html: string,
  printerNameOverride?: string,
): Promise<string> {
  await connectQz();
  const name = (printerNameOverride || getProfile(profile).printerName).trim();
  if (!name) {
    throw new Error('No hay impresora asignada para este perfil. Configúrala en Ajustes.');
  }
  if (profile === 'labels') {
    throw new Error('Las etiquetas usan TSPL raw, no HTML');
  }
  const config = receiptConfig(name);
  await qz.print(config, [
    {
      type: 'pixel',
      format: 'html',
      flavor: 'plain',
      data: html,
    },
  ]);
  return name;
}

/** Etiqueta: TSPL raw a la impresora de etiquetas (n copias). */
export async function tryQzPrintLabel(
  name: string,
  code: string,
  copies = 1,
): Promise<{ ok: true; printer: string; copies: number } | { ok: false; reason: string }> {
  if (!QZ_TRAY_ENABLED) {
    return { ok: false, reason: 'Impresión directa no disponible' };
  }
  const prefs = loadPrintPrefs();
  if (!prefs.preferQzWhenAvailable) {
    return { ok: false, reason: 'Preferencia: usar diálogo del navegador' };
  }
  const printer = getProfile('labels').printerName.trim();
  if (!printer) {
    return { ok: false, reason: 'Sin impresora asignada' };
  }
  const n = Math.max(1, Math.min(999, Math.floor(Number(copies) || 1)));
  try {
    const used = await printLabelTsplViaQz(name, code, printer, n);
    return { ok: true, printer: used, copies: n };
  } catch (err) {
    return { ok: false, reason: humanizeQzError(err) };
  }
}

/** Comprobantes HTML vía QZ. */
export async function tryQzPrint(
  profile: PrintProfileId,
  html: string,
): Promise<{ ok: true; printer: string } | { ok: false; reason: string }> {
  if (profile === 'labels') {
    return { ok: false, reason: 'Usa tryQzPrintLabel para etiquetas' };
  }
  if (!QZ_TRAY_ENABLED) {
    return { ok: false, reason: 'Impresión directa no disponible' };
  }
  const prefs = loadPrintPrefs();
  if (!prefs.preferQzWhenAvailable) {
    return { ok: false, reason: 'Preferencia: usar diálogo del navegador' };
  }
  const printer = getProfile(profile).printerName.trim();
  if (!printer) {
    return { ok: false, reason: 'Sin impresora asignada' };
  }
  try {
    const used = await printHtmlViaQz(profile, html, printer);
    return { ok: true, printer: used };
  } catch (err) {
    return { ok: false, reason: humanizeQzError(err) };
  }
}

export async function probeQzStatus(): Promise<QzStatus> {
  if (!QZ_TRAY_ENABLED) return 'unavailable';
  try {
    await connectQz();
    return 'connected';
  } catch {
    return 'unavailable';
  }
}
