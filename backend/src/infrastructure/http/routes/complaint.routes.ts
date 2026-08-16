import { Router } from 'express';

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
router.post('/', (_req, res) => {
  res.status(501).json({ message: 'Por implementar: crear reclamo' });
});

// PUT /api/v1/complaints/:id/status - Actualizar estado del reclamo (empresa/admin)
router.put('/:id/status', (_req, res) => {
  res.status(501).json({ message: 'Por implementar: actualizar estado de reclamo' });
});

export default router;
