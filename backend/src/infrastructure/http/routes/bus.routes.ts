import { Router } from 'express';
import { buses, processSimulationEvent, SimulationEventType } from '../../socket/simulation';

const router = Router();

// GET /api/v1/buses - Listar todas las micros simuladas y su aforo actual
router.get('/', (_req, res) => {
  res.json({
    status: 'success',
    data: buses,
  });
});

// GET /api/v1/buses/:id - Obtener micro por ID
router.get('/:id', (req, res) => {
  const bus = buses.find((b) => b.id === req.params.id);
  if (!bus) {
    return res.status(404).json({ message: 'Microbús no encontrado' });
  }
  res.json({
    status: 'success',
    data: bus,
  });
});

// POST /api/v1/buses/simulate-event - Fallback REST para inyectar eventos de simulación
router.post('/simulate-event', (req, res) => {
  const { busId, eventType } = req.body as { busId: string; eventType: SimulationEventType };
  if (!busId || !eventType) {
    return res.status(400).json({ message: 'busId y eventType son requeridos' });
  }

  const updated = processSimulationEvent(busId, eventType);
  if (!updated) {
    return res.status(404).json({ message: `Microbús ${busId} no encontrado` });
  }

  res.json({
    status: 'success',
    message: `Evento ${eventType} procesado con éxito`,
    data: updated,
  });
});

export default router;

