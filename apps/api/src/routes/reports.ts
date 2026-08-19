import { Router } from 'express';
import { requireAuth, requireBranch, requireRoles } from '../middleware/auth.js';
import {
  getGastosReport,
  getIngresosReport,
  getMermasReport,
  getStockReport,
  getVentasReport,
  isReportVista,
  loadBranch,
  reportMeta,
} from '../services/reports.js';
import { buildReportWorkbook, reportExcelFilename } from '../services/reportsExcel.js';
import { resolveReportPeriod } from '../utils/chileDate.js';
import { asyncHandler, HttpError } from '../utils/errors.js';

export const reportsRouter = Router();
reportsRouter.use(requireAuth, requireBranch, requireRoles('owner', 'branch_manager'));

/**
 * GET /api/reports/:vista?from=&to=
 * GET /api/reports/:vista/export?from=&to=
 * Vistas: ventas | stock | ingresos | gastos | mermas
 * Fechas civiles America/Santiago. Scope: X-Branch-Id (todas las cajas).
 * No reutiliza GET /api/dashboard/summary.
 */
reportsRouter.get(
  '/:vista/export',
  asyncHandler(async (req, res) => {
    const vista = String(req.params.vista || '');
    if (!isReportVista(vista)) {
      throw new HttpError(400, 'Vista inválida. Usa ventas, stock, ingresos, gastos o mermas.');
    }
    const { from, to } = await resolveReportPeriod(req.query);
    const branchId = req.activeBranchId!;
    const branch = await loadBranch(branchId);
    const meta = reportMeta(vista, branch, from, to);
    const wb = await buildReportWorkbook(vista, branchId, meta);
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
      throw new HttpError(400, 'Vista inválida. Usa ventas, stock, ingresos, gastos o mermas.');
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
    const data = await getMermasReport(branchId, from, to);
    res.json({ ...meta, ...data });
  }),
);
