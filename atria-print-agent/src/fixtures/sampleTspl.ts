/**
 * TSPL de muestra — misma estructura que `buildLabelTspl` en apps/web (SIZE 50×25, GAP, BARCODE 128, PRINT n,1).
 * Copia de fixture para el Agent; **no** modifica la función de la SPA.
 * Copias = 1 en PRINT 1,1 (un solo job, como QZ).
 */
export const SAMPLE_LABEL_TSPL = [
  'SIZE 50 mm,25 mm',
  'GAP 2 mm,0',
  'DIRECTION 1',
  'REFERENCE 0,0',
  'SET TEAR ON',
  'CLS',
  'TEXT 85,40,"2",0,1,1,"Atria Sample"',
  'BARCODE 52,70,"128",82,0,0,2,4,"TEST001"',
  'TEXT 118,156,"1",0,1,1,"TEST001"',
  'PRINT 1,1',
  '',
].join('\r\n');

export const SAMPLE_PRINTER_NAME = 'Xprinter_XP-420B';
