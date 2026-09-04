import { Router, Response } from 'express';
import { PrismaComplaintRepository } from '../../database/prisma/repositories/PrismaComplaintRepository';
import { authenticate, authorize, AuthRequest } from '../middlewares/auth.middleware';
import { AppError } from '../../../shared/errors/AppError';
import { ComplaintStatus } from '../../../shared/enums';
import { ComplaintCategory } from '../../../domain/entities/Complaint';

const router = Router();
const repo = new PrismaComplaintRepository();

// ── GET /api/v1/complaints ────────────────────────────────────
// ADMIN: ve todos los reclamos
// COMPANY: ve solo los de su empresa
router.get(
  '/',
  authenticate,
  authorize('ADMIN', 'COMPANY'),
  async (req: AuthRequest, res: Response, next) => {
    try {
      const complaints =
        req.user!.role === 'ADMIN'
          ? await repo.findAll()
          : await repo.findByCompanyId(req.user!.id);

      res.json({ data: complaints });
    } catch (err) {
      next(err);
    }
  },
);

// ── GET /api/v1/complaints/my ─────────────────────────────────
// PASSENGER: ve sus propios reclamos
router.get(
  '/my',
  authenticate,
  authorize('PASSENGER'),
  async (req: AuthRequest, res: Response, next) => {
    try {
      const complaints = await repo.findByPassengerId(req.user!.id);
      res.json({ data: complaints });
    } catch (err) {
      next(err);
    }
  },
);

// ── GET /api/v1/complaints/:id ────────────────────────────────
// Cualquier usuario autenticado puede ver un reclamo por ID
router.get(
  '/:id',
  authenticate,
  async (req: AuthRequest, res: Response, next) => {
    try {
      const complaint = await repo.findById(req.params.id);
      if (!complaint) throw new AppError('Reclamo no encontrado', 404);

      // PASSENGER solo puede ver sus propios reclamos
      if (
        req.user!.role === 'PASSENGER' &&
        complaint.passengerId !== req.user!.id
      ) {
        throw new AppError('No tienes permisos para ver este reclamo', 403);
      }

      res.json({ data: complaint });
    } catch (err) {
      next(err);
    }
  },
);

// ── POST /api/v1/complaints ───────────────────────────────────
// PASSENGER: crea un nuevo reclamo
router.post(
  '/',
  authenticate,
  authorize('PASSENGER'),
  async (req: AuthRequest, res: Response, next) => {
    try {
      const { title, description, category, busId, routeId, companyId } =
        req.body as {
          title: string;
          description: string;
          category: ComplaintCategory;
          busId?: string;
          routeId?: string;
          companyId: string;
        };

      if (!title || !description || !category || !companyId) {
        throw new AppError(
          'Los campos title, description, category y companyId son requeridos',
          400,
        );
      }

      const complaint = await repo.create({
        title,
        description,
        category,
        status: ComplaintStatus.PENDING,
        passengerId: req.user!.id,
        busId: busId ?? null,
        routeId: routeId ?? null,
        companyId,
        adminResponse: null,
      });

      res.status(201).json({ data: complaint });
    } catch (err) {
      next(err);
    }
  },
);

// ── PUT /api/v1/complaints/:id/status ────────────────────────
// ADMIN / COMPANY: cambia estado y agrega respuesta
router.put(
  '/:id/status',
  authenticate,
  authorize('ADMIN', 'COMPANY'),
  async (req: AuthRequest, res: Response, next) => {
    try {
      const { status, adminResponse } = req.body as {
        status: ComplaintStatus;
        adminResponse?: string;
      };

      const validStatuses = Object.values(ComplaintStatus);
      if (!status || !validStatuses.includes(status)) {
        throw new AppError(
          `Estado inválido. Debe ser uno de: ${validStatuses.join(', ')}`,
          400,
        );
      }

      const existing = await repo.findById(req.params.id);
      if (!existing) throw new AppError('Reclamo no encontrado', 404);

      // COMPANY solo puede gestionar reclamos de su empresa
      if (
        req.user!.role === 'COMPANY' &&
        existing.companyId !== req.user!.id
      ) {
        throw new AppError('No tienes permisos para gestionar este reclamo', 403);
      }

      const updated = await repo.update(req.params.id, {
        status,
        adminResponse: adminResponse ?? null,
      });

      res.json({ data: updated });
    } catch (err) {
      next(err);
    }
  },
);

// ── DELETE /api/v1/complaints/:id ────────────────────────────
// ADMIN: elimina un reclamo
router.delete(
  '/:id',
  authenticate,
  authorize('ADMIN'),
  async (req: AuthRequest, res: Response, next) => {
    try {
      const existing = await repo.findById(req.params.id);
      if (!existing) throw new AppError('Reclamo no encontrado', 404);

      await repo.delete(req.params.id);
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  },
);

export default router;
