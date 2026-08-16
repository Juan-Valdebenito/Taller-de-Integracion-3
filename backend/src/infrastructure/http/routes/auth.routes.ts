import { Router } from 'express';
// import { AuthController } from '../controllers/AuthController';

const router = Router();

// POST /api/v1/auth/register
router.post('/register', (_req, res) => {
  res.status(501).json({ message: 'Por implementar: registro de usuario' });
});

// POST /api/v1/auth/login
router.post('/login', (_req, res) => {
  res.status(501).json({ message: 'Por implementar: login de usuario' });
});

// POST /api/v1/auth/logout
router.post('/logout', (_req, res) => {
  res.status(501).json({ message: 'Por implementar: logout de usuario' });
});

// GET /api/v1/auth/me
router.get('/me', (_req, res) => {
  res.status(501).json({ message: 'Por implementar: obtener usuario autenticado' });
});

export default router;
