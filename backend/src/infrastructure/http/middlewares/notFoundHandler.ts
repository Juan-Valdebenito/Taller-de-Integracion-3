import { Request, Response } from 'express';

/**
 * Middleware que responde con 404 cuando ninguna ruta coincide.
 */
export const notFoundHandler = (_req: Request, res: Response): void => {
  res.status(404).json({
    status: 'error',
    message: `Ruta no encontrada: ${_req.method} ${_req.originalUrl}`,
  });
};
