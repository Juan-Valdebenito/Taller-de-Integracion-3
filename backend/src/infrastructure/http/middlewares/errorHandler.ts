import { Request, Response, NextFunction } from 'express';
import { AppError } from '../../../shared/errors/AppError';

/**
 * Middleware global de manejo de errores.
 * Debe registrarse DESPUÉS de todas las rutas en app.ts.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const errorHandler = (
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void => {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      status: 'error',
      message: err.message,
    });
    return;
  }

  // Error no controlado
  console.error('[ERROR]', err);
  res.status(500).json({
    status: 'error',
    message: 'Error interno del servidor',
  });
};
