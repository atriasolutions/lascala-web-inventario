import { Router } from 'express';
import { requireAuth, requireBranch, requireRoles } from '../middleware/auth.js';
import {
  getGastosReport,
  getIngresosReport,
  getInventariosReport,
  getMermasReport,
  getStockReport,
  getVentasReport,
  isReportVista,
  loadBranch,
  parseStocktakeIdQuery,
  reportMeta,
} from '../services/reports.js';
import { buildReportWorkbook, reportExcelFilename } from '../services/reportsExcel.js';
import { resolveReportPeriod } from '../utils/chileDate.js';
import { asyncHandler, HttpError } from '../utils/errors.js';

export const reportsRouter = Router();
reportsRouter.use(requireAuth, requireBranch, requireRoles('owner'));

/**
 * GET /api/reports/:vista?from=&to=&stocktakeId=
 * GET /api/reports/:vista/export?from=&to=&stocktakeId=
 * Vistas: ventas | stock | ingresos | gastos | mermas | inventarios
 * Fechas civiles America/Santiago. Scope: X-Branch-Id (todas las cajas).
 * No reutiliza GET /api/dashboard/summary.
 */
reportsRouter.get(
  '/:vista/export',
  asyncHandler(async (req, res) => {
    const vista = String(req.params.vista || '');
    if (!isReportVista(vista)) {
      throw new HttpError(400, 'Vista inválida. Usa ventas, stock, ingresos, gastos, mermas o inventarios.');
    }
    const { from, to } = await resolveReportPeriod(req.query);
    const branchId = req.activeBranchId!;
    const branch = await loadBranch(branchId);
    const meta = reportMeta(vista, branch, from, to);
    const stocktakeId = parseStocktakeIdQuery(req.query.stocktakeId);
    const wb = await buildReportWorkbook(vista, branchId, meta, { stocktakeId });
    const filename = reportExcelFilename(meta);
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    await wb.xlsx.write(res);
    res.end();
  }),
);

reportsRouter.get(
  '/:vista',
  asyncHandler(async (req, res) => {
    const vista = String(req.params.vista || '');
    if (!isReportVista(vista)) {
      throw new HttpError(400, 'Vista inválida. Usa ventas, stock, ingresos, gastos, mermas o inventarios.');
    }
    const { from, to } = await resolveReportPeriod(req.query);
    const branchId = req.activeBranchId!;
    const branch = await loadBranch(branchId);
    const meta = reportMeta(vista, branch, from, to);

    if (vista === 'ventas') {
      const data = await getVentasReport(branchId, from, to, req.query);
      res.json({ ...meta, ...data });
      return;
    }
    if (vista === 'stock') {
      const data = await getStockReport(branchId);
      res.json({ ...meta, ...data });
      return;
    }
    if (vista === 'ingresos') {
      const data = await getIngresosReport(branchId, from, to);
      res.json({ ...meta, ...data });
      return;
    }
    if (vista === 'gastos') {
      const data = await getGastosReport(branchId, from, to);
      res.json({ ...meta, ...data });
      return;
    }
    if (vista === 'inventarios') {
      const stocktakeId = parseStocktakeIdQuery(req.query.stocktakeId);
      const data = await getInventariosReport(branchId, from, to, stocktakeId);
      res.json({ ...meta, ...data });
      return;
    }
    const data = await getMermasReport(branchId, from, to);
    res.json({ ...meta, ...data });
  }),
);
