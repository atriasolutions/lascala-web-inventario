import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { access } from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import type { CommandRunner } from './commandRunner.js';

const CHROME_CANDIDATES_DARWIN = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
];

const CHROME_CANDIDATES_WIN = [
  path.join(process.env.PROGRAMFILES || 'C:\\Program Files', 'Google', 'Chrome', 'Application', 'chrome.exe'),
  path.join(
    process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)',
    'Google',
    'Chrome',
    'Application',
    'chrome.exe',
  ),
  path.join(process.env.PROGRAMFILES || 'C:\\Program Files', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
  path.join(
    process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)',
    'Microsoft',
    'Edge',
    'Application',
    'msedge.exe',
  ),
];

async function fileExists(p: string): Promise<boolean> {
  try {
    await access(p, fsConstants.X_OK);
    return true;
  } catch {
    try {
      await access(p, fsConstants.F_OK);
      return true;
    } catch {
      return false;
    }
  }
}

/** Localiza Chrome/Edge/Chromium (legado document; comprobantes usan ESC/POS). */
export async function findHeadlessBrowser(): Promise<string | null> {
  const list = process.platform === 'win32' ? CHROME_CANDIDATES_WIN : CHROME_CANDIDATES_DARWIN;
  for (const candidate of list) {
    if (await fileExists(candidate)) return candidate;
  }
  return null;
}

export function ensureReceiptPageCss(html: string): string {
  if (/@page\s*\{/.test(html)) return html;
  const pageCss = `@page { size: 80mm auto; margin: 4mm; }`;
  if (/<\/head>/i.test(html)) {
    return html.replace(/<\/head>/i, `<style>${pageCss}</style></head>`);
  }
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><style>${pageCss}</style></head><body>${html}</body></html>`;
}

/**
 * HTML → texto para ESC/POS.
 * Crítico: insertar ": " / espacios al cerrar dt/span/strong para no pegar
 * "Fecha"+"12-08" ni "TOTAL"+"$9.980".
 */
export function htmlToPlainText(html: string): string {
  let s = html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<svg[\s\S]*?<\/svg>/gi, '')
    .replace(/<img[^>]*>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n');

  s = s.replace(
    /<\/?(div|p|tr|h[1-6]|li|table|thead|tbody|header|article|section|ul|ol|dl|footer)(?:\s[^>]*)?>/gi,
    '\n',
  );

  s = s.replace(/<dt(?:\s[^>]*)?>/gi, '');
  s = s.replace(/<\/dt>/gi, ': ');
  s = s.replace(/<dd(?:\s[^>]*)?>/gi, '');
  s = s.replace(/<\/dd>/gi, '\n');

  s = s.replace(/<\/th>/gi, '  ');
  s = s.replace(/<\/td>/gi, '  ');
  s = s.replace(/<t[hd](?:\s[^>]*)?>/gi, '');

  s = s.replace(/<\/(span|strong|b|em|i|label)>/gi, ' ');
  s = s.replace(/<(span|strong|b|em|i|label)(?:\s[^>]*)?>/gi, '');

  s = s.replace(/<[^>]+>/g, '');

  s = s
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&apos;/gi, "'");

  s = s
    .split('\n')
    .map((line) => {
      // Conservar padding de líneas tipo caja (TOTAL … $)
      if (/ {2,}/.test(line) && /(\$|TOTAL|Subtotal|Descuento|Cant)/i.test(line)) {
        return line.replace(/\s+$/g, '');
      }
      return line.replace(/[ \t\f\v]+/g, ' ').trim();
    })
    .filter((line) => Boolean(line))
    .join('\n')
    .trim();

  return s;
}

export type HtmlRenderResult = {
  dir: string;
  filePath: string;
  kind: 'pdf' | 'html' | 'text';
};

/** Legado document printers — comprobantes térmicos no usan este path. */
export async function materializeHtmlJob(
  html: string,
  run: CommandRunner,
): Promise<HtmlRenderResult> {
  const prepared = ensureReceiptPageCss(html);
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'atria-html-'));
  const htmlPath = path.join(dir, 'receipt.html');
  await fs.writeFile(htmlPath, prepared, 'utf8');

  const browser = await findHeadlessBrowser();
  if (browser) {
    const pdfPath = path.join(dir, 'receipt.pdf');
    const fileUrl = pathToFileUrl(htmlPath);
    const result = await run(
      browser,
      [
        '--headless=new',
        '--disable-gpu',
        '--no-first-run',
        '--no-default-browser-check',
        '--no-pdf-header-footer',
        `--print-to-pdf=${pdfPath}`,
        fileUrl,
      ],
      { timeoutMs: 25_000 },
    );
    try {
      await access(pdfPath, fsConstants.F_OK);
      if (result.code === 0 || (await fileSize(pdfPath)) > 64) {
        return { dir, filePath: pdfPath, kind: 'pdf' };
      }
    } catch {
      /* caer a HTML */
    }
  }

  return { dir, filePath: htmlPath, kind: 'html' };
}

async function fileSize(p: string): Promise<number> {
  const st = await fs.stat(p);
  return st.size;
}

function pathToFileUrl(filePath: string): string {
  const resolved = path.resolve(filePath);
  if (process.platform === 'win32') {
    const normalized = resolved.replace(/\\/g, '/');
    return `file:///${normalized}`;
  }
  return `file://${resolved}`;
}

export async function cleanupTempDir(dir: string): Promise<void> {
  await fs.rm(dir, { recursive: true, force: true }).catch(() => undefined);
}
