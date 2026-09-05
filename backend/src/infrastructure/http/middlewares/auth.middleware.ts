import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { AppError } from '../../../shared/errors/AppError';

export interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    role: 'PASSENGER' | 'COMPANY' | 'ADMIN';
  };
}

/**
 * Middleware de autenticación JWT.
 * Verifica el token Bearer del header Authorization.
 */
export const authenticate = (
  req: AuthRequest,
  _res: Response,
  next: NextFunction,
): void => {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    return next(new AppError('Token de autenticación requerido', 401));
  }

  const token = authHeader.split(' ')[1];

  try {
    const secret = process.env.JWT_SECRET ?? '';
    const decoded = jwt.verify(token, secret) as AuthRequest['user'];
    req.user = decoded;
    next();
  } catch {
    next(new AppError('Token inválido o expirado', 401));
  }
};

/**
 * Middleware de autorización por roles.
 * @example authorize('ADMIN', 'COMPANY')
 */
export const authorize = (...roles: Array<'PASSENGER' | 'COMPANY' | 'ADMIN'>) => {
  return (req: AuthRequest, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      return next(new AppError('No autenticado', 401));
    }

    if (!roles.includes(req.user.role)) {
      return next(
        new AppError('No tienes permisos para realizar esta acción', 403),
      );
    }

    next();
  };
};
