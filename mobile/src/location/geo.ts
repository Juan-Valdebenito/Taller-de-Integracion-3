/**
 * Cálculos geográficos para verificar si el usuario está en un paradero.
 * Funciones puras (sin dependencias de React ni del dispositivo).
 */

export interface Coordinates {
  latitude: number;
  longitude: number;
}

export interface Stop extends Coordinates {
  id: string;
  name: string;
}

/** Radio medio de la Tierra en metros (IUGG). */
const EARTH_RADIUS_M = 6_371_008.8;

const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

/**
 * Distancia en metros entre dos coordenadas (fórmula de Haversine). Precisa
 * para las distancias de una ciudad (error < 0,5 % frente al elipsoide).
 */
export function distanceInMeters(a: Coordinates, b: Coordinates): number {
  const dLat = toRadians(b.latitude - a.latitude);
  const dLon = toRadians(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRadians(a.latitude)) * Math.cos(toRadians(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function isValidCoordinates({ latitude, longitude }: Coordinates): boolean {
  return (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    Math.abs(latitude) <= 90 &&
    Math.abs(longitude) <= 180 &&
    // (0, 0) es el valor que llega cuando falta el dato (omitempty en el backend).
    !(latitude === 0 && longitude === 0)
  );
}

export interface NearestStop {
  stop: Stop;
  distanceMeters: number;
}

/** Paradero más cercano a la posición, o null si la lista está vacía. */
export function findNearestStop(position: Coordinates, stops: readonly Stop[]): NearestStop | null {
  let nearest: NearestStop | null = null;
  for (const stop of stops) {
    if (!isValidCoordinates(stop)) continue;
    const distanceMeters = distanceInMeters(position, stop);
    if (!nearest || distanceMeters < nearest.distanceMeters) {
      nearest = { stop, distanceMeters };
    }
  }
  return nearest;
}

/**
 * Resultado de la verificación de cercanía:
 * - inside:       a menos de `radiusMeters` de un paradero oficial (se permiten alertas)
 * - outside:      hay paraderos cerca, pero ninguno dentro del radio
 * - no-stops:     no hay paraderos oficiales en la zona buscada
 * - low-accuracy: el GPS es demasiado impreciso para confirmar la cercanía
 */
export type ProximityStatus = 'inside' | 'outside' | 'no-stops' | 'low-accuracy';

export interface ProximityResult {
  status: ProximityStatus;
  nearest: NearestStop | null;
  radiusMeters: number;
}

export interface ProximityOptions {
  radiusMeters: number;
  /** Incertidumbre máxima aceptable de la ubicación (m). */
  maxAccuracyMeters: number;
}

/**
 * Verifica si la posición está dentro del radio de algún paradero oficial.
 * Solo devuelve "inside" si además la precisión del GPS es suficiente: una
 * ubicación con ±300 m no permite afirmar que el usuario está en el paradero.
 */
export function checkStopProximity(
  position: Coordinates & { accuracy?: number | null },
  stops: readonly Stop[],
  { radiusMeters, maxAccuracyMeters }: ProximityOptions,
): ProximityResult {
  const nearest = findNearestStop(position, stops);
  if (!nearest) {
    return { status: 'no-stops', nearest: null, radiusMeters };
  }
  if (position.accuracy != null && position.accuracy > maxAccuracyMeters) {
    return { status: 'low-accuracy', nearest, radiusMeters };
  }
  return { status: nearest.distanceMeters <= radiusMeters ? 'inside' : 'outside', nearest, radiusMeters };
}

/** "85 m" o "1,2 km". */
export function formatDistance(meters: number): string {
  if (meters < 1000) {
    return `${Math.round(meters)} m`;
  }
  return `${(meters / 1000).toFixed(1).replace('.', ',')} km`;
}
