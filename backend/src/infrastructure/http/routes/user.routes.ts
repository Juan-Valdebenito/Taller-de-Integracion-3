import { Router } from 'express';

const router = Router();

// GET /api/v1/users
router.get('/', (_req, res) => {
  res.status(501).json({ message: 'Por implementar: listar usuarios' });
});

// GET /api/v1/users/:id
router.get('/:id', (_req, res) => {
  res.status(501).json({ message: 'Por implementar: obtener usuario por ID' });
});

// PUT /api/v1/users/:id
router.put('/:id', (_req, res) => {
  res.status(501).json({ message: 'Por implementar: actualizar usuario' });
});

// DELETE /api/v1/users/:id
router.delete('/:id', (_req, res) => {
  res.status(501).json({ message: 'Por implementar: eliminar usuario' });
});

export default router;
