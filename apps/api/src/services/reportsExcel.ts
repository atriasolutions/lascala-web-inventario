import ExcelJS from 'exceljs';
import type { ReportMeta, ReportVista } from './reports.js';
import {
  exportGastosItems,
  exportIngresosDocs,
  exportMermasItems,
  exportStockAging,
  exportVentasTickets,
  getGastosReport,
  getIngresosReport,
  getInventariosReport,
  getMermasReport,
  getStockReport,
  getVentasReport,
} from './reports.js';

const FUCSIA = 'FFE6007E';

function slugPart(s: string) {
  return s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
}

export function reportExcelFilename(meta: ReportMeta) {
  const vistaLabel: Record<ReportVista, string> = {
    ventas: 'Ventas',
    stock: 'Stock',
    ingresos: 'Ingresos',
    gastos: 'Gastos',
    mermas: 'Mermas',
    inventarios: 'Inventarios',
  };
  const branch = slugPart(meta.branch.code || meta.branch.name) || 'Sucursal';
  const sameMonth = meta.from.slice(0, 7) === meta.to.slice(0, 7);
  const range = sameMonth ? meta.from.slice(0, 7) : `${meta.from}_${meta.to}`;
  return `LScala-${vistaLabel[meta.vista]}-${branch}-${range}.xlsx`;
}

function headerRow(sheet: ExcelJS.Worksheet, values: string[]) {
  const row = sheet.addRow(values);
  row.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: FUCSIA } };
  row.alignment = { vertical: 'middle' };
  return row;
}

function titleBlock(sheet: ExcelJS.Worksheet, title: string, meta: ReportMeta) {
  sheet.addRow([title]);
  sheet.addRow([`Sucursal: ${meta.branch.name} (${meta.branch.code})`]);
  sheet.addRow([`Periodo: ${meta.from} a ${meta.to} · ${meta.timezone}`]);
  sheet.addRow([`Generado: ${meta.generatedAt}`]);
  sheet.addRow([]);
}

function moneyCol(sheet: ExcelJS.Worksheet, col: number) {
  sheet.getColumn(col).numFmt = '#,##0';
}

export async function buildReportWorkbook(
  vista: ReportVista,
  branchId: string,
  meta: ReportMeta,
  opts: { stocktakeId?: string | null; paymentMethod?: unknown } = {},
) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Atria Solutions SpA · L'Scala";
  wb.created = new Date();

  if (vista === 'ventas') {
    const data = await getVentasReport(branchId, meta.from, meta.to, {
      limit: 1,
      offset: 0,
      paymentMethod: opts.paymentMethod,
    });
    const tickets = await exportVentasTickets(branchId, meta.from, meta.to, opts.paymentMethod);

    const s1 = wb.addWorksheet('Tickets', { views: [{ state: 'frozen', ySplit: 6 }] });
    titleBlock(s1, "Ventas · Boutique L'Scala", meta);
    headerRow(s1, ['Fecha (Chile)', 'N°', 'Caja', 'Vendedora', 'Total', 'Pago', 'Origen']);
    for (const r of tickets.rows) {
      const pago = r.payment_method === 'card' ? 'Tarjeta' : 'Efectivo';
      s1.addRow([
        r.sold_at_cl,
        r.receipt_number,
        r.pos_name,
        r.seller_name,
        Number(r.total),
        pago,
        r.origen,
      ]);
    }
    moneyCol(s1, 5);
    s1.columns = [
      { width: 24 },
      { width: 14 },
      { width: 16 },
      { width: 24 },
      { width: 14 },
      { width: 12 },
      { width: 12 },
    ];

    const s2 = wb.addWorksheet('Ranking');
    titleBlock(s2, 'Ranking (máx. 50) · margen = venta − último Precio costo', meta);
    headerRow(s2, ['Código', 'Producto', 'Ud. vendidas', 'Venta', 'Precio costo', 'Margen']);
    for (const r of data.ranking) {
      s2.addRow([
        r.internal_code,
        r.name,
        Number(r.qty_sold),
        Number(r.revenue),
        Number(r.cost_total),
        Number(r.margin),
      ]);
    }
    moneyCol(s2, 4);
    moneyCol(s2, 5);
    moneyCol(s2, 6);
    s2.columns = [{ width: 14 }, { width: 32 }, { width: 14 }, { width: 14 }, { width: 16 }, { width: 14 }];

    const s3 = wb.addWorksheet('Vendedora y caja');
    titleBlock(s3, 'Cortes por vendedora y caja', meta);
    headerRow(s3, ['Tipo', 'Nombre', 'Tickets', 'Total']);
    for (const r of data.bySeller) {
      s3.addRow(['Vendedora', r.seller_name, Number(r.count), Number(r.total)]);
    }
    for (const r of data.byPos) {
      s3.addRow(['Caja', r.pos_name, Number(r.count), Number(r.total)]);
    }
    moneyCol(s3, 4);

    const s4 = wb.addWorksheet('Serie');
    titleBlock(s4, `Serie del gráfico (${data.grain})`, meta);
    headerRow(s4, ['Periodo', 'Etiqueta', 'Tickets', 'Unidades', 'Total']);
    for (const r of data.series) {
      s4.addRow([r.period, r.label, Number(r.count), Number(r.units ?? 0), Number(r.total)]);
    }
    moneyCol(s4, 5);
  }

  if (vista === 'stock') {
    const data = await getStockReport(branchId);
    const rows = await exportStockAging(branchId);
    const s1 = wb.addWorksheet('Por categoría');
    titleBlock(s1, 'Stock · valor a precio de venta', meta);
    headerRow(s1, ['Categoría', 'SKUs', 'Unidades', 'Valor p. venta', 'Stock bajo', 'Negativos']);
    for (const r of data.byCategory) {
      s1.addRow([
        r.category_name,
        r.sku_count,
        r.units,
        Number(r.sale_value),
        r.low_count,
        r.negative_count,
      ]);
    }
    moneyCol(s1, 4);
    s1.columns = [{ width: 24 }, { width: 10 }, { width: 12 }, { width: 16 }, { width: 12 }, { width: 12 }];

    const s2 = wb.addWorksheet('Inventario');
    titleBlock(s2, 'Inventario (tope 5000)', meta);
    headerRow(s2, ['Código', 'Producto', 'Categoría', 'Stock', 'P. venta', 'Valor sala']);
    for (const r of rows.rows) {
      s2.addRow([
        r.internal_code,
        r.name,
        r.category_name,
        r.quantity,
        Number(r.sale_price),
        Number(r.sale_value),
      ]);
    }
    moneyCol(s2, 5);
    moneyCol(s2, 6);
    s2.columns = [{ width: 14 }, { width: 32 }, { width: 20 }, { width: 10 }, { width: 12 }, { width: 14 }];
  }

  if (vista === 'ingresos') {
    const data = await getIngresosReport(branchId, meta.from, meta.to);
    const docs = await exportIngresosDocs(branchId, meta.from, meta.to);
    const s1 = wb.addWorksheet('Documentos');
    titleBlock(s1, 'Ingresos · Precio costo', meta);
    headerRow(s1, ['Fecha', 'N°', 'Tipo', 'Estado', 'Proveedor', 'Ud. pedidas', 'Ud. recibidas', 'Precio costo']);
    for (const r of docs.rows) {
      s1.addRow([
        r.doc_date,
        r.invoice_number,
        r.document_type,
        r.status,
        r.supplier_name,
        r.units_ordered,
        r.units_received,
        Number(r.cost_total),
      ]);
    }
    moneyCol(s1, 8);
    s1.columns = [
      { width: 14 },
      { width: 16 },
      { width: 12 },
      { width: 20 },
      { width: 24 },
      { width: 12 },
      { width: 14 },
      { width: 14 },
    ];

    const s2 = wb.addWorksheet('Serie');
    titleBlock(s2, `Reinversión (${data.grain})`, meta);
    headerRow(s2, ['Periodo', 'Etiqueta', 'Docs', 'Precio costo']);
    for (const r of data.series) {
      s2.addRow([r.period, r.label, Number(r.count), Number(r.total)]);
    }
    moneyCol(s2, 4);
  }

  if (vista === 'gastos') {
    const data = await getGastosReport(branchId, meta.from, meta.to);
    const items = await exportGastosItems(branchId, meta.from, meta.to);
    const s1 = wb.addWorksheet('Gastos');
    titleBlock(s1, 'Gastos de operación', meta);
    headerRow(s1, ['Fecha', 'Categoría', 'Descripción', 'Monto', 'Registró']);
    for (const r of items.rows) {
      s1.addRow([r.incurred_on, r.category, r.description, Number(r.amount), r.created_by_name]);
    }
    moneyCol(s1, 4);
    s1.columns = [{ width: 14 }, { width: 18 }, { width: 40 }, { width: 14 }, { width: 22 }];

    const s2 = wb.addWorksheet('Categoria x mes');
    titleBlock(s2, 'Categoría × mes', meta);
    headerRow(s2, ['Mes', 'Categoría', 'Total']);
    for (const r of data.byCategoryMonth) {
      s2.addRow([r.month, r.category, Number(r.total)]);
    }
    moneyCol(s2, 3);

    const s3 = wb.addWorksheet('Serie');
    titleBlock(s3, `Gastos (${data.grain})`, meta);
    headerRow(s3, ['Periodo', 'Etiqueta', 'Registros', 'Total']);
    for (const r of data.series) {
      s3.addRow([r.period, r.label, Number(r.count), Number(r.total)]);
    }
    moneyCol(s3, 4);
  }

  if (vista === 'mermas') {
    const data = await getMermasReport(branchId, meta.from, meta.to);
    const items = await exportMermasItems(branchId, meta.from, meta.to);
    const s1 = wb.addWorksheet('Mermas');
    titleBlock(s1, 'Mermas · impacto Precio costo', meta);
    headerRow(s1, ['Fecha (Chile)', 'Código', 'Producto', 'Ud.', 'Motivo', 'Impacto costo', 'Registró']);
    for (const r of items.rows) {
      s1.addRow([
        r.created_at_cl,
        r.internal_code,
        r.product_name,
        r.quantity,
        r.reason,
        Number(r.cost_impact),
        r.created_by_name,
      ]);
    }
    moneyCol(s1, 6);
    s1.columns = [
      { width: 22 },
      { width: 14 },
      { width: 28 },
      { width: 8 },
      { width: 28 },
      { width: 14 },
      { width: 22 },
    ];

    const s2 = wb.addWorksheet('Motivo x mes');
    titleBlock(s2, 'Motivo × mes', meta);
    headerRow(s2, ['Mes', 'Motivo', 'Unidades', 'Impacto costo']);
    for (const r of data.byReasonMonth) {
      s2.addRow([r.month, r.reason, Number(r.units), Number(r.cost_impact)]);
    }
    moneyCol(s2, 4);

    const s3 = wb.addWorksheet('Vouchers');
    titleBlock(s3, 'Vouchers emitidos en el periodo', meta);
    headerRow(s3, ['Estado', 'Cantidad']);
    for (const [status, count] of Object.entries(data.vouchers)) {
      s3.addRow([status, count]);
    }
  }

  if (vista === 'inventarios') {
    const data = await getInventariosReport(branchId, meta.from, meta.to, opts.stocktakeId ?? null);
    const s1 = wb.addWorksheet('Resumen');
    titleBlock(s1, "Pérdida/Ganancia por inventario · Boutique L'Scala", meta);
    s1.addRow(['Valoración', data.notes.valuation]);
    s1.addRow(['Neto', data.notes.neto]);
    s1.addRow([]);
    headerRow(s1, ['Concepto', 'Unidades', 'Valor a p. venta']);
    s1.addRow(['Faltante', data.totals.faltante_units, Number(data.totals.faltante_value)]);
    s1.addRow(['Sobrante', data.totals.sobrante_units, Number(data.totals.sobrante_value)]);
    s1.addRow(['Neto (sobrante − faltante)', '', Number(data.totals.neto_value)]);
    moneyCol(s1, 3);
    s1.columns = [{ width: 32 }, { width: 14 }, { width: 20 }];

    const s2 = wb.addWorksheet('Líneas');
    titleBlock(s2, 'Diferencias aplicadas (físico o ajuste)', meta);
    headerRow(s2, [
      'Toma',
      'Código',
      'Prenda',
      'Decisión',
      'Tipo',
      'Stock al cerrar',
      'Queda',
      'Ud.',
      'P. venta',
      'Valor',
    ]);
    for (const r of data.items) {
      s2.addRow([
        r.take_label,
        r.internal_code,
        r.product_name,
        r.decision_label,
        r.kind,
        r.qty_system,
        r.qty_final,
        r.units,
        Number(r.sale_price),
        Number(r.sale_value),
      ]);
    }
    moneyCol(s2, 9);
    moneyCol(s2, 10);
    s2.columns = [
      { width: 14 },
      { width: 14 },
      { width: 32 },
      { width: 22 },
      { width: 12 },
      { width: 14 },
      { width: 10 },
      { width: 8 },
      { width: 12 },
      { width: 14 },
    ];

    const s3 = wb.addWorksheet('Tomas');
    titleBlock(s3, 'Tomas aplicadas (selector)', meta);
    headerRow(s3, ['N°', 'Aplicada', 'Usuario']);
    for (const t of data.takes) {
      s3.addRow([t.take_label, t.applied_at_cl, t.applied_by_name]);
    }
    s3.columns = [{ width: 14 }, { width: 24 }, { width: 24 }];
  }

  return wb;
}
