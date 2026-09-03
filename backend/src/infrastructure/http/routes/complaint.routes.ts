import { Router, Request, Response } from 'express';
import { ComplaintStore } from '../../database/complaintStore';
import { ComplaintCategory, ComplaintStatus } from '@prisma/client';

const router = Router();

// GET /api/v1/complaints - Listar reclamos e incidentes (con filtros de estado, categoría y bus)
router.get('/', async (req: Request, res: Response) => {
  try {
    const { status, category, busId } = req.query;

    const filters: {
      status?: ComplaintStatus;
      category?: ComplaintCategory;
      busId?: string;
    } = {};

    if (status && Object.values(ComplaintStatus).includes(status as ComplaintStatus)) {
      filters.status = status as ComplaintStatus;
    }

    if (category && Object.values(ComplaintCategory).includes(category as ComplaintCategory)) {
      filters.category = category as ComplaintCategory;
    }

    if (busId && typeof busId === 'string') {
      filters.busId = busId;
    }

    const complaints = await ComplaintStore.listAll(filters);

    res.json({
      status: 'success',
      count: complaints.length,
      data: complaints,
    });
  } catch (error) {
    console.error('[COMPLAINTS GET ERROR]', error);
    res.status(500).json({ status: 'error', message: 'Error al listar reclamos' });
  }
});

// GET /api/v1/complaints/:id - Obtener detalle de reclamo por ID
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const complaint = await ComplaintStore.findById(req.params.id);
    if (!complaint) {
      return res.status(404).json({ status: 'fail', message: 'Reclamo no encontrado' });
    }

    res.json({
      status: 'success',
      data: complaint,
    });
  } catch (error) {
    res.status(500).json({ status: 'error', message: 'Error al obtener reclamo' });
  }
});

// POST /api/v1/complaints - Crear nuevo reclamo (pasajero o reporte contextual)
router.post('/', async (req: Request, res: Response) => {
  try {
    const { busId, lineName, title, description, category, rating, passengerId } = req.body;

    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({
        status: 'fail',
        message: 'La calificación (rating) debe ser un número entero entre 1 y 5 estrellas',
      });
    }

    // Sanitizar textos para evitar inyección
    const cleanTitle = (title || `Incidente en Línea ${lineName || 'Desconocida'}`)
      .toString()
      .trim()
      .substring(0, 150);

    const cleanDescription = (description || 'Sin comentarios adicionales')
      .toString()
      .trim()
      .substring(0, 1000);

    let prismaCategory: ComplaintCategory = ComplaintCategory.OTHER;
    if (category && Object.values(ComplaintCategory).includes(category as ComplaintCategory)) {
      prismaCategory = category as ComplaintCategory;
    }

    const complaint = await ComplaintStore.create({
      title: cleanTitle,
      description: cleanDescription,
      category: prismaCategory,
      rating: Number(rating),
      busId: busId || undefined,
      lineName: lineName || undefined,
      passengerId: passengerId || undefined,
    });

    res.status(201).json({
      status: 'success',
      message: 'Reclamo registrado exitosamente en el protocolo de gestión',
      data: complaint,
    });
  } catch (error) {
    console.error('[COMPLAINTS POST ERROR]', error);
    res.status(500).json({ status: 'error', message: 'Error interno al registrar el reclamo' });
  }
});

// PATCH / PUT /api/v1/complaints/:id/status - Actualizar estado y respuesta del administrador
const handleStatusUpdate = async (req: Request, res: Response) => {
  try {
    const { status, adminResponse } = req.body;

    if (!status || !Object.values(ComplaintStatus).includes(status as ComplaintStatus)) {
      return res.status(400).json({
        status: 'fail',
        message: `Estado inválido. Los estados permitidos son: ${Object.values(ComplaintStatus).join(', ')}`,
      });
    }

    const updated = await ComplaintStore.updateStatus(
      req.params.id,
      status as ComplaintStatus,
      adminResponse
    );

    if (!updated) {
      return res.status(404).json({ status: 'fail', message: 'Reclamo no encontrado' });
    }

    res.json({
      status: 'success',
      message: `Estado del reclamo actualizado a ${status}`,
      data: updated,
    });
  } catch (error) {
    console.error('[COMPLAINTS STATUS UPDATE ERROR]', error);
    res.status(500).json({ status: 'error', message: 'Error al actualizar estado del reclamo' });
  }
};

router.put('/:id/status', handleStatusUpdate);
router.patch('/:id/status', handleStatusUpdate);

export default router;

