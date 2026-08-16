import { Router } from 'express';

const router = Router();

// GET /api/v1/routes - Listar todas las rutas/líneas
router.get('/', (_req, res) => {
  res.status(501).json({ message: 'Por implementar: listar rutas' });
});

// GET /api/v1/routes/:id - Obtener ruta por ID
router.get('/:id', (_req, res) => {
  res.status(501).json({ message: 'Por implementar: obtener ruta por ID' });
});

// GET /api/v1/routes/:id/stops - Obtener paradas de una ruta
router.get('/:id/stops', (_req, res) => {
  res.status(501).json({ message: 'Por implementar: obtener paradas de ruta' });
});

// GET /api/v1/routes/:id/buses - Micros activas en la ruta
router.get('/:id/buses', (_req, res) => {
  res.status(501).json({ message: 'Por implementar: micros activas en la ruta' });
});

// POST /api/v1/routes - Crear ruta (admin)
router.post('/', (_req, res) => {
  res.status(501).json({ message: 'Por implementar: crear ruta' });
});

// PUT /api/v1/routes/:id - Actualizar ruta
router.put('/:id', (_req, res) => {
  res.status(501).json({ message: 'Por implementar: actualizar ruta' });
});

// DELETE /api/v1/routes/:id - Eliminar ruta
router.delete('/:id', (_req, res) => {
  res.status(501).json({ message: 'Por implementar: eliminar ruta' });
});

export default router;
