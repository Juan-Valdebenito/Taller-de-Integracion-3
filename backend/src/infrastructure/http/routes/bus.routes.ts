import { Router } from 'express';

const router = Router();

// GET /api/v1/buses - Listar todas las micros (con filtro por ruta)
router.get('/', (_req, res) => {
  res.status(501).json({ message: 'Por implementar: listar micros' });
});

// GET /api/v1/buses/:id - Obtener micro por ID
router.get('/:id', (_req, res) => {
  res.status(501).json({ message: 'Por implementar: obtener micro por ID' });
});

// GET /api/v1/buses/:id/location - Ubicación en tiempo real (fallback REST)
router.get('/:id/location', (_req, res) => {
  res.status(501).json({ message: 'Por implementar: ubicación de micro (usar Socket.io)' });
});

// POST /api/v1/buses - Crear micro (empresa/admin)
router.post('/', (_req, res) => {
  res.status(501).json({ message: 'Por implementar: crear micro' });
});

// PUT /api/v1/buses/:id - Actualizar micro
router.put('/:id', (_req, res) => {
  res.status(501).json({ message: 'Por implementar: actualizar micro' });
});

// DELETE /api/v1/buses/:id - Eliminar micro
router.delete('/:id', (_req, res) => {
  res.status(501).json({ message: 'Por implementar: eliminar micro' });
});

export default router;
