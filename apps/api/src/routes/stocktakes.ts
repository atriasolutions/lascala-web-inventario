import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db/pool.js';
import { requireAuth, requireBranch, requireRoles } from '../middleware/auth.js';
import { FLOOR_ROLES, LEAD_ROLES } from '../auth/roles.js';
import { asyncHandler, HttpError } from '../utils/errors.js';
import {
  applyStocktake,
  cancelStocktake,
  completeStocktake,
  createOrResumeStocktake,
  findOpenStocktake,
  loadStocktake,
  removeStocktakeLine,
  scanStocktakeLine,
  updateStocktakeLineQty,
} from '../services/stocktakes.js';
import { fetchLimit, parsePagination, slicePage } from '../utils/pagination.js';

export const stocktakesRouter = Router();
stocktakesRouter.use(requireAuth, requireBranch);

const countRoles = FLOOR_ROLES;
const applyRoles = LEAD_ROLES;

stocktakesRouter.get(
  '/',
  requireRoles(...countRoles),
  asyncHandler(async (req, res) => {
    const { limit, offset } = parsePagination(req.query);
    const params: unknown[] = [req.user!.organizationId, req.activeBranchId];
    const from = `
      FROM stocktakes s
      LEFT JOIN users u ON u.id = s.started_by
      WHERE s.organization_id = $1 AND s.branch_id = $2`;
    const count = await query(`SELECT COUNT(*)::int AS n ${from}`, params);
    const listParams = [...params, fetchLimit(limit), offset];
    const result = await query(
      `SELECT s.id, s.take_number, s.take_label, s.status, s.started_at::text,
              s.completed_at::text, s.applied_at::text,
              COALESCE(s.applied_at, s.completed_at)::text AS ended_at,
              u.full_name AS started_by_name,
              (SELECT COUNT(*)::int FROM stocktake_lines l WHERE l.stocktake_id = s.id) AS line_count,
              (SELECT COALESCE(SUM(l.qty_counted), 0)::int FROM stocktake_lines l WHERE l.stocktake_id = s.id) AS units_counted
       ${from}
       ORDER BY s.started_at DESC
       LIMIT $${listParams.length - 1} OFFSET $${listParams.length}`,
      listParams,
    );
    const page = slicePage(result.rows, limit, offset);
    res.json({
      stocktakes: page.items,
      hasMore: page.hasMore,
      limit: page.limit,
      offset: page.offset,
      nextOffset: page.nextOffset,
      total: Number(count.rows[0]?.n || 0),
    });
  }),
);

stocktakesRouter.get(
  '/current',
  requireRoles(...countRoles),
  asyncHandler(async (req, res) => {
    const open = await findOpenStocktake(req.user!.organizationId, req.activeBranchId!);
    if (!open) {
      res.json({ stocktake: null });
      return;
    }
    const full = await loadStocktake(open.id, req.user!.organizationId, req.activeBranchId!);
    res.json(full);
  }),
);

stocktakesRouter.post(
  '/',
  requireRoles(...countRoles),
  asyncHandler(async (req, res) => {
    const body = z.object({ replace: z.boolean().optional() }).parse(req.body ?? {});
    if (body.replace && req.activeRole === 'seller') {
      throw new HttpError(403, 'No puedes anular una toma en curso');
    }
    const result = await createOrResumeStocktake({
      organizationId: req.user!.organizationId,
      branchId: req.activeBranchId!,
      userId: req.user!.id,
      replaceOpen: Boolean(body.replace),
    });
    res.status(result.resumed ? 200 : 201).json(result);
  }),
);

stocktakesRouter.get(
  '/:id',
  requireRoles(...countRoles),
  asyncHandler(async (req, res) => {
    const id = z.string().uuid().parse(req.params.id);
    const full = await loadStocktake(id, req.user!.organizationId, req.activeBranchId!);
    res.json(full);
  }),
);

stocktakesRouter.post(
  '/:id/scan',
  requireRoles(...countRoles),
  asyncHandler(async (req, res) => {
    const id = z.string().uuid().parse(req.params.id);
    const body = z
      .object({
        code: z.string().trim().min(1, 'Pistolea o escribe el código'),
        quantity: z.number().int().nonnegative().optional(),
        mode: z.enum(['add', 'set']).optional(),
      })
      .parse(req.body ?? {});
    const result = await scanStocktakeLine({
      organizationId: req.user!.organizationId,
      branchId: req.activeBranchId!,
      stocktakeId: id,
      code: body.code,
      quantity: body.quantity,
      mode: body.mode,
    });
    res.json(result);
  }),
);

stocktakesRouter.delete(
  '/:id/lines/:productId',
  requireRoles(...countRoles),
  asyncHandler(async (req, res) => {
    const id = z.string().uuid().parse(req.params.id);
    const productId = z.string().uuid().parse(req.params.productId);
    const result = await removeStocktakeLine({
      organizationId: req.user!.organizationId,
      branchId: req.activeBranchId!,
      stocktakeId: id,
      productId,
    });
    res.json(result);
  }),
);

/** Actualiza cantidad de una línea (por id de línea). qtyCounted 0 elimina la línea. */
stocktakesRouter.patch(
  '/:id/lines/:lineId',
  requireRoles(...countRoles),
  asyncHandler(async (req, res) => {
    const id = z.string().uuid().parse(req.params.id);
    const lineId = z.string().uuid().parse(req.params.lineId);
    const body = z
      .object({
        qtyCounted: z.number().int().nonnegative(),
      })
      .parse(req.body ?? {});
    const result = await updateStocktakeLineQty({
      organizationId: req.user!.organizationId,
      branchId: req.activeBranchId!,
      stocktakeId: id,
      lineId,
      qtyCounted: body.qtyCounted,
    });
    res.json(result);
  }),
);

stocktakesRouter.post(
  '/:id/complete',
  requireRoles(...countRoles),
  asyncHandler(async (req, res) => {
    const id = z.string().uuid().parse(req.params.id);
    const result = await completeStocktake({
      organizationId: req.user!.organizationId,
      branchId: req.activeBranchId!,
      stocktakeId: id,
      userId: req.user!.id,
    });
    res.json(result);
  }),
);

stocktakesRouter.post(
  '/:id/apply',
  requireRoles(...applyRoles),
  asyncHandler(async (req, res) => {
    const id = z.string().uuid().parse(req.params.id);
    const body = z
      .object({
        decisions: z
          .array(
            z.object({
              productId: z.string().uuid(),
              action: z.enum(['keep_system', 'use_physical', 'adjust']),
              qtyOverride: z.number().int().nonnegative().optional().nullable(),
            }),
          )
          .default([]),
      })
      .parse(req.body ?? {});
    const result = await applyStocktake({
      organizationId: req.user!.organizationId,
      branchId: req.activeBranchId!,
      stocktakeId: id,
      userId: req.user!.id,
      decisions: body.decisions,
    });
    res.json(result);
  }),
);

stocktakesRouter.post(
  '/:id/cancel',
  requireRoles(...applyRoles),
  asyncHandler(async (req, res) => {
    const id = z.string().uuid().parse(req.params.id);
    const result = await cancelStocktake({
      organizationId: req.user!.organizationId,
      branchId: req.activeBranchId!,
      stocktakeId: id,
      userId: req.user!.id,
    });
    res.json(result);
  }),
);
