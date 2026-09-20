import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { SecurityService } from '../../../shared/security/securityService';
import { UserStore } from '../../database/userStore';
import {
  validateRegistration,
  validateLogin,
  handleValidationErrors,
} from '../middlewares/userValidation.middleware';
import { authenticate, AuthRequest } from '../middlewares/auth.middleware';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'jwt_secret_dev_key_temuco_2026';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

// POST /api/v1/auth/register - Registro seguro con validación, sanitización y hashing bcrypt
router.post(
  '/register',
  ...validateRegistration,
  handleValidationErrors,
  async (req: Request, res: Response) => {
    try {
      const { name, email, password, role } = req.body;

      // Comprobar si el usuario ya existe
      const existingUser = await UserStore.findByEmail(email);
      if (existingUser) {
        return res.status(409).json({
          status: 'fail',
          message: 'El correo electrónico ya se encuentra registrado en el sistema',
        });
      }

      // Hashing seguro de contraseña con bcrypt (cost factor = 12 + pepper)
      const passwordHash = await SecurityService.hashPassword(password);

      // Crear usuario con datos sanitizados
      const newUser = await UserStore.create({
        name,
        email,
        passwordHash,
        role: role || 'PASSENGER',
      });

      // Generar JWT token
      const token = jwt.sign(
        { id: newUser.id, email: newUser.email, role: newUser.role },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRES_IN as any }
      );

      // Sanitizar datos de respuesta (nunca exponer passwordHash)
      const sanitizedUser = SecurityService.sanitizeUser(newUser);

      res.status(201).json({
        status: 'success',
        message: 'Usuario registrado exitosamente',
        data: {
          token,
          user: sanitizedUser,
        },
      });
    } catch (error: any) {
      console.error('[AUTH REGISTER ERROR]', error);
      res.status(500).json({ status: 'error', message: 'Error interno en el registro de usuario' });
    }
  }
);

// POST /api/v1/auth/login - Autenticación con verificación bcrypt en tiempo constante
router.post(
  '/login',
  ...validateLogin,
  handleValidationErrors,
  async (req: Request, res: Response) => {
    try {
      const { email, password } = req.body;

      // Buscar usuario por correo normalizado
      const user = await UserStore.findByEmail(email);
      if (!user) {
        // Mensaje genérico para prevenir enumeración de cuentas
        return res.status(401).json({
          status: 'fail',
          message: 'Credenciales inválidas (correo o contraseña incorrectos)',
        });
      }

      // Comparación segura con bcrypt
      const isPasswordValid = await SecurityService.comparePassword(password, user.passwordHash);
      if (!isPasswordValid) {
        return res.status(401).json({
          status: 'fail',
          message: 'Credenciales inválidas (correo o contraseña incorrectos)',
        });
      }

      if (!user.isActive) {
        return res.status(403).json({
          status: 'fail',
          message: 'Esta cuenta de usuario ha sido desactivada',
        });
      }

      // Generar JWT token
      const token = jwt.sign(
        { id: user.id, email: user.email, role: user.role },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRES_IN as any }
      );

      // Retornar usuario sanitizado
      const sanitizedUser = SecurityService.sanitizeUser(user);

      res.json({
        status: 'success',
        message: 'Autenticación exitosa',
        data: {
          token,
          user: sanitizedUser,
        },
      });
    } catch (error: any) {
      console.error('[AUTH LOGIN ERROR]', error);
      res.status(500).json({ status: 'error', message: 'Error interno en la autenticación' });
    }
  }
);


// POST /api/v1/auth/logout - Cierre de sesión
router.post('/logout', (_req, res) => {
  res.json({
    status: 'success',
    message: 'Sesión finalizada exitosamente',
  });
});

// GET /api/v1/auth/me - Obtener datos del usuario autenticado sanitizados
router.get('/me', authenticate, async (req: AuthRequest, res) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ status: 'fail', message: 'No autenticado' });
    }

    const user = await UserStore.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ status: 'fail', message: 'Usuario no encontrado' });
    }

    res.json({
      status: 'success',
      data: {
        user: SecurityService.sanitizeUser(user),
      },
    });
  } catch (error) {
    res.status(500).json({ status: 'error', message: 'Error al recuperar perfil' });
  }
});

export default router;

