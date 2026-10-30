/**
 * Acceso a la ubicación del dispositivo con expo-location.
 *
 * Solo se usa la ubicación "mientras la app está en uso" (foreground): sirve
 * para verificar si el usuario está cerca de un paradero antes de emitir
 * alertas de proximidad. No se pide ubicación en segundo plano.
 */
import * as Location from 'expo-location';

/**
 * Estado del permiso de ubicación:
 * - granted:      concedido
 * - undetermined: aún no se ha preguntado
 * - denied:       rechazado, pero se puede volver a preguntar
 * - blocked:      rechazado sin opción de volver a preguntar (solo desde Ajustes)
 */
export type LocationPermission = 'granted' | 'undetermined' | 'denied' | 'blocked';

export interface UserPosition {
  latitude: number;
  longitude: number;
  /** Radio de incertidumbre en metros (null si el sistema no lo informa). */
  accuracy: number | null;
  /** Momento de la medición (ms desde epoch). */
  timestamp: number;
}

export type LocationErrorCode = 'permission-denied' | 'services-disabled' | 'timeout' | 'unavailable';

const ERROR_MESSAGES: Record<LocationErrorCode, string> = {
  'permission-denied': 'Necesitamos permiso de ubicación para saber si estás cerca de un paradero.',
  'services-disabled': 'La ubicación del teléfono está desactivada. Actívala en la configuración del dispositivo.',
  timeout: 'No se pudo obtener tu ubicación a tiempo. Intenta en un lugar con mejor señal.',
  unavailable: 'No se pudo obtener tu ubicación en este momento.',
};

/** Error de ubicación con un mensaje listo para mostrar al usuario. */
export class LocationError extends Error {
  readonly code: LocationErrorCode;

  constructor(code: LocationErrorCode) {
    super(ERROR_MESSAGES[code]);
    this.name = 'LocationError';
    this.code = code;
  }
}

/** Tiempo máximo para obtener la posición (en interiores el GPS puede no responder). */
export const POSITION_TIMEOUT_MS = 15_000;

/** Una posición guardada por el sistema sirve como respaldo si tiene menos de esto. */
const LAST_KNOWN_MAX_AGE_MS = 60_000;

function toPermission(response: Location.LocationPermissionResponse): LocationPermission {
  if (response.granted) {
    return 'granted';
  }
  if (response.status === Location.PermissionStatus.UNDETERMINED) {
    return 'undetermined';
  }
  return response.canAskAgain ? 'denied' : 'blocked';
}

function toPosition(location: Location.LocationObject): UserPosition {
  return {
    latitude: location.coords.latitude,
    longitude: location.coords.longitude,
    accuracy: location.coords.accuracy ?? null,
    timestamp: location.timestamp,
  };
}

/** Consulta el permiso actual sin mostrar ningún diálogo. */
export async function getLocationPermission(): Promise<LocationPermission> {
  return toPermission(await Location.getForegroundPermissionsAsync());
}

/** Muestra el diálogo del sistema (si aún se puede) y devuelve el resultado. */
export async function requestLocationPermission(): Promise<LocationPermission> {
  return toPermission(await Location.requestForegroundPermissionsAsync());
}

/**
 * Obtiene la posición actual. Si no llega dentro de timeoutMs, usa una
 * posición reciente guardada por el sistema; si tampoco hay, falla con
 * LocationError('timeout').
 */
export async function getCurrentPosition(timeoutMs: number = POSITION_TIMEOUT_MS): Promise<UserPosition> {
  if ((await getLocationPermission()) !== 'granted') {
    throw new LocationError('permission-denied');
  }
  if (!(await Location.hasServicesEnabledAsync())) {
    throw new LocationError('services-disabled');
  }

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), timeoutMs);
  });

  try {
    const current = await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
      timeout,
    ]);
    if (current) {
      return toPosition(current);
    }
  } catch {
    // Sigue con el respaldo de la última posición conocida.
  } finally {
    clearTimeout(timer);
  }

  const lastKnown = await Location.getLastKnownPositionAsync({ maxAge: LAST_KNOWN_MAX_AGE_MS }).catch(() => null);
  if (lastKnown) {
    return toPosition(lastKnown);
  }
  throw new LocationError('timeout');
}

/**
 * Seguimiento de la posición: se recibe una nueva cuando el usuario se mueve
 * al menos esta distancia (m) o pasa este tiempo (ms), lo primero que ocurra.
 * 20 m es bastante menos que el radio de un paradero (100 m por defecto).
 */
export const WATCH_DISTANCE_INTERVAL_M = 20;
export const WATCH_TIME_INTERVAL_MS = 10_000;

/**
 * Sigue la posición del usuario mientras la app está en primer plano.
 * Devuelve la función para detener el seguimiento. Requiere permiso concedido.
 */
export interface WatchOptions {
  distanceIntervalM?: number;
  timeIntervalMs?: number;
  /** Más precisión gasta más batería (el modo conductor la necesita). */
  highAccuracy?: boolean;
}

export async function watchPosition(
  onPosition: (position: UserPosition) => void,
  onError?: (error: LocationError) => void,
  { distanceIntervalM = WATCH_DISTANCE_INTERVAL_M, timeIntervalMs = WATCH_TIME_INTERVAL_MS, highAccuracy = false }: WatchOptions = {},
): Promise<() => void> {
  const subscription = await Location.watchPositionAsync(
    {
      accuracy: highAccuracy ? Location.Accuracy.High : Location.Accuracy.Balanced,
      distanceInterval: distanceIntervalM,
      timeInterval: timeIntervalMs,
    },
    (location) => onPosition(toPosition(location)),
    () => onError?.(new LocationError('unavailable')),
  );
  return () => subscription.remove();
}
