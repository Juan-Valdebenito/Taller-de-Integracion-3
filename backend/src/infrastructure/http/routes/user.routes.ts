import { Router, Request, Response } from 'express';
import { UserStore } from '../../database/userStore';
import { SecurityService } from '../../../shared/security/securityService';
import {
  validateUserUpdate,
  handleValidationErrors,
} from '../middlewares/userValidation.middleware';

const router = Router();

// GET /api/v1/users - Listar usuarios con sanitización y soporte de enmascaramiento para privacidad
router.get('/', async (req: Request, res: Response) => {
  try {
    const shouldMask = req.query.mask === 'true';
    const users = await UserStore.listAll();

    const sanitizedUsers = users.map((u) => {
      const safe = SecurityService.sanitizeUser(u);
      if (shouldMask) {
        return {
          ...safe,
          email: SecurityService.maskEmail(safe.email),
          pseudoId: SecurityService.pseudonymize(safe.id),
        };
      }
      return safe;
    });

    res.json({
      status: 'success',
      data: sanitizedUsers,
    });
  } catch (error) {
    res.status(500).json({ status: 'error', message: 'Error al listar usuarios' });
  }
});

// GET /api/v1/users/:id - Obtener usuario por ID con sanitización
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const user = await UserStore.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ status: 'fail', message: 'Usuario no encontrado' });
    }

    res.json({
      status: 'success',
      data: SecurityService.sanitizeUser(user),
    });
  } catch (error) {
    res.status(500).json({ status: 'error', message: 'Error al obtener usuario' });
  }
});

// PUT /api/v1/users/:id - Actualizar usuario con validación, sanitización y hashing si cambia contraseña
router.put('/:id', ...validateUserUpdate, handleValidationErrors, async (req: Request, res: Response) => {

  try {
    const { name, email, password, isActive } = req.body;

    const existing = await UserStore.findById(req.params.id);
    if (!existing) {
      return res.status(404).json({ status: 'fail', message: 'Usuario no encontrado' });
    }

    const updatePayload: { name?: string; email?: string; passwordHash?: string; isActive?: boolean } = {};
    if (name) updatePayload.name = name;
    if (email) updatePayload.email = email;
    if (isActive !== undefined) updatePayload.isActive = isActive;
    if (password) {
      updatePayload.passwordHash = await SecurityService.hashPassword(password);
    }

    const updated = await UserStore.update(req.params.id, updatePayload);
    if (!updated) {
      return res.status(500).json({ status: 'error', message: 'No se pudo actualizar el usuario' });
    }

    res.json({
      status: 'success',
      message: 'Usuario actualizado exitosamente',
      data: SecurityService.sanitizeUser(updated),
    });
  } catch (error) {
    res.status(500).json({ status: 'error', message: 'Error al actualizar usuario' });
  }
});

// DELETE /api/v1/users/:id - Desactivación segura (soft delete)
router.delete('/:id', async (req, res) => {
  try {
    const updated = await UserStore.update(req.params.id, { isActive: false });
    if (!updated) {
      return res.status(404).json({ status: 'fail', message: 'Usuario no encontrado' });
    }

    res.json({
      status: 'success',
      message: 'Usuario desactivado exitosamente',
    });
  } catch (error) {
    res.status(500).json({ status: 'error', message: 'Error al desactivar usuario' });
  }
});

export default router;

