/**
 * Resuelve un hex/CSS color a partir del nombre de color del producto.
 * En DB solo existe `products.color` (texto); no hay `color_hex`.
 */

const NAMED: Record<string, string> = {
  negro: '#1a1a1a',
  black: '#1a1a1a',
  blanco: '#f5f5f5',
  white: '#f5f5f5',
  'off white': '#f3efe6',
  offwhite: '#f3efe6',
  ivory: '#fffff0',
  marfil: '#fffff0',
  crudo: '#ebe3d4',
  crema: '#f5e6c8',
  cream: '#f5e6c8',
  beige: '#d4b896',
  arena: '#c2a878',
  camel: '#c19a6b',
  nude: '#e0b090',
  cafe: '#6b4226',
  café: '#6b4226',
  marron: '#6b4226',
  marrón: '#6b4226',
  chocolate: '#4a2c1a',
  tostado: '#8b5a2b',
  rojo: '#c62828',
  red: '#c62828',
  fucsia: '#e6007e',
  fuchsia: '#e6007e',
  magenta: '#c2185b',
  rosa: '#e91e8c',
  rosado: '#f48fb1',
  pink: '#e91e8c',
  coral: '#ff7043',
  naranja: '#ef6c00',
  orange: '#ef6c00',
  mostaza: '#c9a227',
  amarillo: '#f9a825',
  yellow: '#f9a825',
  dorado: '#c9a227',
  gold: '#c9a227',
  verde: '#2e7d32',
  green: '#2e7d32',
  'verde oliva': '#556b2f',
  oliva: '#556b2f',
  menta: '#66bb6a',
  azul: '#1565c0',
  blue: '#1565c0',
  celeste: '#4fc3f7',
  turquesa: '#26a69a',
  'azul marino': '#0d2137',
  navy: '#0d2137',
  marino: '#0d2137',
  denim: '#3d5a80',
  jean: '#3d5a80',
  lila: '#9c6ade',
  lavanda: '#b39ddb',
  morado: '#7b1fa2',
  purple: '#7b1fa2',
  violeta: '#7b1fa2',
  burdeos: '#7b1e3a',
  bordo: '#7b1e3a',
  vino: '#6d1a2a',
  burgundy: '#7b1e3a',
  gris: '#757575',
  gray: '#757575',
  grey: '#757575',
  'gris claro': '#bdbdbd',
  'gris oscuro': '#424242',
  plateado: '#b0b0b0',
  silver: '#b0b0b0',
  plata: '#b0b0b0',
  print: '#8d6e63',
  estampado: '#8d6e63',
  multicolor: '#8d6e63',
  animal: '#8d6e63',
};

/** Presets para selectores (Chile / boutique). */
export const COLOR_PRESETS = [
  'Negro',
  'Blanco',
  'Beige',
  'Crema',
  'Camel',
  'Rojo',
  'Fucsia',
  'Rosa',
  'Coral',
  'Naranja',
  'Mostaza',
  'Verde',
  'Verde oliva',
  'Azul',
  'Azul marino',
  'Celeste',
  'Lila',
  'Burdeos',
  'Gris',
  'Plateado',
  'Denim',
  'Estampado',
  'Multicolor',
] as const;

function normalizeColorKey(raw: string) {
  return raw
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

/** Si el texto ya trae un color CSS válido (#hex / rgb / hsl). */
function parseEmbeddedColor(raw: string): string | null {
  const t = raw.trim();
  if (/^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(t)) return t;
  if (/^(rgb|hsl)a?\(/i.test(t)) return t;
  const embedded = t.match(/#([0-9a-f]{3}|[0-9a-f]{6})\b/i);
  if (embedded) return embedded[0];
  return null;
}

/** Color estable a partir del nombre (fallback cuando no hay mapeo). */
function hashColor(name: string): string {
  let h = 2166136261;
  for (let i = 0; i < name.length; i += 1) {
    h ^= name.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const hue = h % 360;
  return `hsl(${hue} 38% 58%)`;
}

/**
 * Devuelve un color CSS para el swatch.
 * Orden: hex embebido → tabla de nombres → hash del texto.
 */
export function resolveColorHex(color: string | null | undefined): string | null {
  if (!color?.trim()) return null;
  const raw = color.trim();
  const embedded = parseEmbeddedColor(raw);
  if (embedded) return embedded;

  const key = normalizeColorKey(raw);
  if (NAMED[key]) return NAMED[key];

  // Prefijos comunes: "azul claro", "rojo oscuro"
  for (const [name, hex] of Object.entries(NAMED)) {
    if (key.startsWith(`${name} `) || key.endsWith(` ${name}`) || key.includes(` ${name} `)) {
      return hex;
    }
  }

  return hashColor(key);
}
