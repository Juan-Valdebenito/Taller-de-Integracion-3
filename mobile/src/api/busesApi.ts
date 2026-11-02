/**
 * Posiciones de las micros desde backend-go: GET /api/v1/buses?status=ACTIVE.
 * El simulador/telemetría actualiza lastLatitude, lastLongitude y lastLocationAt.
 */
import { isValidCoordinates, type Coordinates } from '../location/geo';
import { apiRequest } from './client';

/** Campos de domain.Bus que usa la app (el resto se ignora). */
interface BusResponse {
  id?: string;
  patente?: string;
  status?: string;
  lastLatitude?: number | null;
  lastLongitude?: number | null;
  lastSpeed?: number | null;
  lastLocationAt?: string | null;
  routeId?: string | null;
}

export interface BusPosition extends Coordinates {
  id: string;
  /** Patente de la micro; vacía si el backend no la informa. */
  patente: string;
  /** Velocidad en km/h, null si no se conoce. */
  speed: number | null;
  /** Momento del último reporte de posición (ms desde epoch). */
  locationAt: number;
  routeId: string | null;
}

/** Normaliza una micro; null si no tiene id, coordenadas válidas o fecha de reporte. */
function toBusPosition(raw: BusResponse): BusPosition | null {
  const locationAt = raw.lastLocationAt ? Date.parse(raw.lastLocationAt) : Number.NaN;
  const bus = {
    id: String(raw.id ?? ''),
    patente: String(raw.patente ?? '').trim(),
    latitude: Number(raw.lastLatitude ?? Number.NaN),
    longitude: Number(raw.lastLongitude ?? Number.NaN),
    speed: raw.lastSpeed ?? null,
    locationAt,
    routeId: raw.routeId ?? null,
  };
  if (!bus.id || !Number.isFinite(locationAt) || !isValidCoordinates(bus)) {
    return null;
  }
  return bus;
}

/** Micros en servicio con su última posición conocida. */
export async function fetchActiveBuses(): Promise<BusPosition[]> {
  const response = await apiRequest<BusResponse[] | null>('/buses?status=ACTIVE');
  return (Array.isArray(response) ? response : []).map(toBusPosition).filter((bus): bus is BusPosition => bus !== null);
}
