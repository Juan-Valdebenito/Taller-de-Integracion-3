/**
 * Paraderos oficiales desde backend-go: GET /api/v1/integrations/micro/stops,
 * proxy gRPC hacia micro_service (paraderos reales de Temuco).
 */
import { isValidCoordinates, type Coordinates, type Stop } from '../location/geo';
import { apiRequest } from './client';

/**
 * Respuesta del backend (mensaje protobuf serializado a JSON). Los campos usan
 * omitempty: sin resultados llega `{}` y un paradero puede venir sin algún campo.
 */
interface ListStopsResponse {
  stops?: Array<Partial<Stop>>;
  total?: number;
}

export interface NearbyStopsQuery extends Coordinates {
  radiusMeters: number;
  /** Máximo de paraderos a traer (el backend usa 50 por defecto). */
  limit?: number;
}

/** Normaliza un paradero de la respuesta; null si le faltan datos o coordenadas válidas. */
function toStop(raw: Partial<Stop>): Stop | null {
  const stop = {
    id: String(raw.id ?? ''),
    name: String(raw.name ?? '').trim(),
    latitude: Number(raw.latitude ?? 0),
    longitude: Number(raw.longitude ?? 0),
  };
  if (!stop.id || !isValidCoordinates(stop)) {
    return null;
  }
  return { ...stop, name: stop.name || 'Paradero sin nombre' };
}

/** Paraderos oficiales dentro de `radiusMeters` de la posición. */
export async function fetchNearbyStops({ latitude, longitude, radiusMeters, limit = 50 }: NearbyStopsQuery): Promise<Stop[]> {
  const params = new URLSearchParams({
    lat: latitude.toFixed(6),
    long: longitude.toFixed(6),
    radius_m: String(Math.round(radiusMeters)),
    limit: String(limit),
  });
  const response = await apiRequest<ListStopsResponse | null>(`/integrations/micro/stops?${params.toString()}`);
  return (response?.stops ?? []).map(toStop).filter((stop): stop is Stop => stop !== null);
}
