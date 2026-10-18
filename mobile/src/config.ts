/**
 * Configuración de la app móvil.
 *
 * EXPO_PUBLIC_API_URL se define en mobile/.env (ver .env.example). Expo la
 * incrusta al compilar, por eso debe empezar con EXPO_PUBLIC_.
 */
const DEFAULT_API_URL = 'http://localhost:3001/api/v1';

/** URL base de la API REST de backend-go (sin "/" final), ej. https://host/api/v1 */
export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? DEFAULT_API_URL).replace(/\/+$/, '');

/** Tiempo máximo de espera de cada solicitud HTTP. */
export const REQUEST_TIMEOUT_MS = 15_000;

function positiveNumber(raw: string | undefined, fallback: number): number {
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

/**
 * Radio (m) alrededor de un paradero oficial dentro del cual se considera que
 * el usuario "está en el paradero" y se permiten alertas de proximidad.
 * Configurable con EXPO_PUBLIC_STOP_RADIUS_M.
 */
export const STOP_RADIUS_M = positiveNumber(process.env.EXPO_PUBLIC_STOP_RADIUS_M, 100);

/**
 * Precisión mínima del GPS (m) para poder verificar la cercanía: si la
 * incertidumbre de la ubicación es mayor, no se confirma que esté en el paradero.
 */
export const MAX_LOCATION_ACCURACY_M = positiveNumber(process.env.EXPO_PUBLIC_MAX_LOCATION_ACCURACY_M, 100);

/** Radio (m) para buscar paraderos cercanos y poder mostrar el más próximo. */
export const STOP_SEARCH_RADIUS_M = 1_000;
