import { Router } from 'express';
import { prisma } from '../../database/prisma/client';
import { ComplaintCategory } from '@prisma/client';

const router = Router();

// GET /api/v1/complaints - Listar reclamos (empresa/admin)
router.get('/', (_req, res) => {
  res.status(501).json({ message: 'Por implementar: listar reclamos' });
});

// GET /api/v1/complaints/:id - Obtener reclamo por ID
router.get('/:id', (_req, res) => {
  res.status(501).json({ message: 'Por implementar: obtener reclamo por ID' });
});

// POST /api/v1/complaints - Crear reclamo (pasajero)
router.post('/', async (req, res) => {
  try {
    const { busId, lineName, title, description, category, rating } = req.body;
    
    // Validación básica
    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ message: 'Rating debe ser entre 1 y 5 estrellas' });
    }
    
    // Mapear categoría a Prisma Enum (o usar OTHER por defecto)
    let prismaCategory = ComplaintCategory.OTHER;
    if (Object.values(ComplaintCategory).includes(category as ComplaintCategory)) {
      prismaCategory = category as ComplaintCategory;
    }

    const complaint = await prisma.complaint.create({
      data: {
        title: title || `Reclamo Línea ${lineName || 'Desconocida'}`,
        description: description || 'Sin comentarios adicionales',
        rating: rating,
        category: prismaCategory,
      }
    });

    res.status(201).json({
      status: 'success',
      data: complaint
    });
  } catch (error) {
    console.error('[COMPLAINTS API]', error);
    res.status(500).json({ message: 'Error interno al crear el reclamo' });
  }
});

// PUT /api/v1/complaints/:id/status - Actualizar estado del reclamo (empresa/admin)
router.put('/:id/status', (_req, res) => {
  res.status(501).json({ message: 'Por implementar: actualizar estado de reclamo' });
});

export default router;
