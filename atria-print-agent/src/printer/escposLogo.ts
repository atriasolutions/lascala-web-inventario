import { encodeCp850, GS } from './encodeCp850.js';

/** Marcador legado; el encabezado real es la línea de texto L'SCALA. */
export const LOGO_LINE_RE = /^\[\[\[LOGO\]\]\]$/i;

export const WORDMARK_RE = /^L['’`]?SCALA$/i;

/**
 * Wordmark de texto. Sin ESC ! (en este clone se come las líneas siguientes).
 * GS ! 0x01 = solo doble alto (mismo ancho → el centrado con espacios sigue válido).
 * Si el clone ignora GS !, igual se lee L'SCALA.
 */
export function buildEscPosWordmark(cols = 48): Buffer {
  const line = centerLine("L'SCALA", cols);
  return Buffer.concat([
    Buffer.from([GS, 0x21, 0x01]),
    encodeCp850(`${line}\n`),
    Buffer.from([GS, 0x21, 0x00]),
  ]);
}

export function buildEscPosLogo(): Buffer {
  return buildEscPosWordmark();
}

export function centerLine(s: string, cols: number): string {
  const t = s.length > cols ? s.slice(0, cols) : s;
  const pad = Math.max(0, Math.floor((cols - t.length) / 2));
  return ' '.repeat(pad) + t;
}
