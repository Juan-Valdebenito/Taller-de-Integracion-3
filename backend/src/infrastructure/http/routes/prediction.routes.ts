import { Router, Request, Response } from 'express';
import { OccupancyPredictionService, PredictionInput } from '../../../domain/services/OccupancyPredictionService';

const router = Router();

/**
 * POST /api/v1/prediction/occupancy
 *
 * Predice el nivel de ocupación de una micro para el próximo tramo.
 *
 * Body:
 *   currentPassengers {number} - Pasajeros actuales (requerido)
 *   capacity          {number} - Capacidad máxima del bus (requerido)
 *   routeId           {string} - ID de la ruta (opcional, para el futuro modelo ML)
 *   hour              {number} - Hora del día 0–23 (opcional, default: hora del sistema)
 *   dayOfWeek         {number} - Día 0=Dom…6=Sáb (opcional, default: hoy)
 *
 * @remarks
 * El campo `isSimulated: true` en la respuesta indica que la predicción
 * usa heurísticas locales y NO un modelo ML real.
 * Cuando lleguen las credenciales del clúster, solo se modifica
 * OccupancyPredictionService.predict() — este endpoint no cambia.
 */
router.post('/occupancy', (req: Request, res: Response) => {
  const { currentPassengers, capacity, routeId, hour, dayOfWeek } = req.body;

  // ── Validación ────────────────────────────────────────────────────────────
  if (currentPassengers === undefined || currentPassengers === null) {
    return res.status(400).json({
      success: false,
      error: 'El campo "currentPassengers" es requerido.',
    });
  }

  if (capacity === undefined || capacity === null) {
    return res.status(400).json({
      success: false,
      error: 'El campo "capacity" es requerido.',
    });
  }

  if (typeof currentPassengers !== 'number' || currentPassengers < 0) {
    return res.status(400).json({
      success: false,
      error: '"currentPassengers" debe ser un número mayor o igual a 0.',
    });
  }

  if (typeof capacity !== 'number' || capacity <= 0) {
    return res.status(400).json({
      success: false,
      error: '"capacity" debe ser un número mayor a 0.',
    });
  }

  if (currentPassengers > capacity) {
    return res.status(400).json({
      success: false,
      error: '"currentPassengers" no puede ser mayor que "capacity".',
    });
  }

  if (hour !== undefined && (typeof hour !== 'number' || hour < 0 || hour > 23)) {
    return res.status(400).json({
      success: false,
      error: '"hour" debe ser un número entre 0 y 23.',
    });
  }

  if (dayOfWeek !== undefined && (typeof dayOfWeek !== 'number' || dayOfWeek < 0 || dayOfWeek > 6)) {
    return res.status(400).json({
      success: false,
      error: '"dayOfWeek" debe ser un número entre 0 (domingo) y 6 (sábado).',
    });
  }

  // ── Predicción ────────────────────────────────────────────────────────────
  const input: PredictionInput = {
    currentPassengers,
    capacity,
    ...(routeId    !== undefined && { routeId }),
    ...(hour       !== undefined && { hour }),
    ...(dayOfWeek  !== undefined && { dayOfWeek }),
  };

  const prediction = OccupancyPredictionService.predict(input);

  return res.status(200).json({
    success: true,
    data: prediction,
  });
});

export default router;
