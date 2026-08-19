/**
 * Texto ESC/POS para térmicas baratas 80 mm (Xprinter / clones).
 *
 * Muchos clones ignoran ESC t (code page) y se quedan en CP437.
 * Minúsculas áéíóúñ coinciden en CP437 y CP850; ÁÍÓÚ NO:
 *   CP850 Ó=0xE0  →  en CP437 es alfa (α) → se lee “DEVOLUCIaN”.
 * Por eso ÁÍÓÚ se pliegan a ASCII; É/Ñ sí son iguales en ambas tablas.
 */

/** Bytes compartidos CP437 ∩ CP850 (español de piso). */
const SHARED_CHAR: Record<string, number> = {
  á: 0xa0,
  é: 0x82,
  í: 0xa1,
  ó: 0xa2,
  ú: 0xa3,
  ñ: 0xa4,
  ü: 0x81,
  É: 0x90,
  Ñ: 0xa5,
  Ü: 0x9a,
  '¿': 0xa8,
  '¡': 0xad,
  º: 0xa7,
  ª: 0xa6,
  '·': 0xfa,
  '°': 0xf8,
  ç: 0x87,
  Ç: 0x80,
  '«': 0xae,
  '»': 0xaf,
};

/** Mayúsculas con tilde que en CP437 NO son letras (Ó→α, etc.). */
const FOLD_ASCII: Record<string, string> = {
  Á: 'A',
  Í: 'I',
  Ó: 'O',
  Ú: 'U',
};

const UNICODE_ASCII: Record<string, string> = {
  '\u2014': '-',
  '\u2013': '-',
  '\u2026': '...',
  '\u201c': '"',
  '\u201d': '"',
  '\u2018': "'",
  '\u2019': "'",
  '\u00a0': ' ',
  '\u2022': '*',
  '\u2702': '',
  '\u2713': 'OK',
  '€': 'EUR',
  '´': "'",
  '`': "'",
};

export const ESC = 0x1b;
export const GS = 0x1d;

/** ESC t 2 = PC850 por si el clone sí lo honra (minúsculas igual que CP437). */
export const ESC_POS_CODE_PAGE_CP850 = Buffer.from([ESC, 0x74, 2]);

export function encodeCp850(text: string): Buffer {
  const bytes: number[] = [];
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    if (cp === 0x0a || cp === 0x0d || (cp >= 0x20 && cp <= 0x7e)) {
      bytes.push(cp);
      continue;
    }
    const shared = SHARED_CHAR[ch];
    if (shared !== undefined) {
      bytes.push(shared);
      continue;
    }
    const foldedUpper = FOLD_ASCII[ch];
    if (foldedUpper) {
      bytes.push(foldedUpper.charCodeAt(0));
      continue;
    }
    const ascii = UNICODE_ASCII[ch];
    if (ascii !== undefined) {
      for (const r of ascii) bytes.push(r.charCodeAt(0) & 0x7f);
      continue;
    }
    const folded = ch.normalize('NFD').replace(/\p{M}/gu, '');
    if (folded && folded !== ch) {
      const one = folded.codePointAt(0)!;
      if (one >= 0x20 && one <= 0x7e) bytes.push(one);
      continue;
    }
  }
  return Buffer.from(bytes);
}

/** @deprecated alias — encoding de ticket, no Latin-1. */
export const encodeLatin1 = encodeCp850;
