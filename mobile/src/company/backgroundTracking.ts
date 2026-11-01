/**
 * GPS del modo conductor en segundo plano (expo-location + expo-task-manager).
 *
 * Con la app abierta, la posición va por el WebSocket (useDriverLocation).
 * Si el conductor bloquea la pantalla o cambia de app, esta tarea sigue
 * recibiendo posiciones y las manda por HTTP a backend-go
 * (POST /telemetry/gps), que las publica en el mapa y las reenvía a
 * micro_telemetry. En Android corre como servicio en primer plano, con una
 * notificación fija mientras dure el recorrido.
 *
 * La tarea se define al cargar este módulo (debe estar en el ámbito global:
 * cuando el sistema despierta la app en segundo plano no hay pantallas
 * montadas). Requiere un build de desarrollo: Expo Go no la permite.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { AppState } from 'react-native';

import { apiRequest } from '../api/client';
import { isWeb } from '../utils/platform';

export const DRIVER_LOCATION_TASK = 'transithub-driver-location';

/** Micro y ruta del recorrido en curso (la tarea no tiene acceso al estado de React). */
const TRIP_KEY = 'transithub.backgroundTrip';
interface StoredTrip {
  busId: string;
  routeId: string;
}

/** Cada cuánto se toma la posición en segundo plano (más espaciado que en primer plano, por la batería). */
export const BACKGROUND_INTERVAL_MS = 10_000;
export const BACKGROUND_DISTANCE_M = 20;

export type BackgroundTrackingStatus =
  | 'off'
  | 'active'
  /** El conductor no dio el permiso de ubicación "siempre". */
  | 'denied'
  /** Expo Go, la vista previa web o un teléfono sin el servicio. */
  | 'unavailable';

async function readTrip(): Promise<StoredTrip | null> {
  try {
    const raw = await AsyncStorage.getItem(TRIP_KEY);
    const parsed = raw ? (JSON.parse(raw) as Partial<StoredTrip>) : null;
    return parsed && typeof parsed.busId === 'string' && typeof parsed.routeId === 'string' ? { busId: parsed.busId, routeId: parsed.routeId } : null;
  } catch {
    return null;
  }
}

/** Datos para POST /telemetry/gps a partir de una posición del sistema. */
export function toGpsReport(trip: StoredTrip, location: Location.LocationObject) {
  const { latitude, longitude, heading, speed } = location.coords;
  return {
    busId: trip.busId,
    routeId: trip.routeId,
    latitude,
    longitude,
    // El sistema da -1 o null cuando no conoce el rumbo o la velocidad.
    heading: heading !== null && heading >= 0 ? Math.round(heading) : 0,
    speed: speed !== null && speed > 0 ? Math.round(speed * 3.6) : 0, // m/s → km/h
    timestamp: new Date(location.timestamp).toISOString(),
  };
}

/**
 * Lo que hace la tarea con cada lote de posiciones: con la app en primer plano
 * no hace nada (ya publica useDriverLocation); si no, envía la más reciente.
 */
export async function handleLocations(locations: readonly Location.LocationObject[]): Promise<void> {
  if (AppState.currentState === 'active' || locations.length === 0) return;
  const trip = await readTrip();
  if (!trip) return;
  const latest = locations.reduce((a, b) => (b.timestamp > a.timestamp ? b : a));
  try {
    await apiRequest('/telemetry/gps', { method: 'POST', body: toGpsReport(trip, latest) });
  } catch {
    // Sin señal o sesión vencida: se intenta con la próxima posición.
  }
}

if (!isWeb()) {
  TaskManager.defineTask<{ locations: Location.LocationObject[] }>(DRIVER_LOCATION_TASK, async ({ data, error }) => {
    if (error || !data?.locations) return;
    await handleLocations(data.locations);
  });
}

/** Empieza a enviar la ubicación en segundo plano durante el recorrido. */
export async function startBackgroundTracking(trip: StoredTrip): Promise<BackgroundTrackingStatus> {
  if (isWeb()) return 'unavailable';
  try {
    if (!(await TaskManager.isAvailableAsync())) return 'unavailable';
    // Primero el permiso con la app abierta (lo pide el modo conductor) y después "siempre".
    const foreground = await Location.getForegroundPermissionsAsync();
    if (!foreground.granted) return 'denied';
    const background = await Location.requestBackgroundPermissionsAsync();
    if (!background.granted) return 'denied';

    await AsyncStorage.setItem(TRIP_KEY, JSON.stringify(trip));
    await Location.startLocationUpdatesAsync(DRIVER_LOCATION_TASK, {
      accuracy: Location.Accuracy.High,
      timeInterval: BACKGROUND_INTERVAL_MS,
      distanceInterval: BACKGROUND_DISTANCE_M,
      foregroundService: {
        notificationTitle: 'Recorrido en curso',
        notificationBody: 'TransitHub está enviando la ubicación de la micro a los pasajeros.',
        notificationColor: '#1d4ed8',
        killServiceOnDestroy: true,
      },
      showsBackgroundLocationIndicator: true,
      pausesUpdatesAutomatically: false,
      activityType: Location.ActivityType.AutomotiveNavigation,
    });
    return 'active';
  } catch {
    // Expo Go o un build sin el servicio de ubicación en segundo plano.
    await AsyncStorage.removeItem(TRIP_KEY).catch(() => undefined);
    return 'unavailable';
  }
}

/** Deja de enviar la ubicación (al terminar el recorrido o cerrar sesión). */
export async function stopBackgroundTracking(): Promise<void> {
  if (isWeb()) return;
  await AsyncStorage.removeItem(TRIP_KEY).catch(() => undefined);
  try {
    if (await Location.hasStartedLocationUpdatesAsync(DRIVER_LOCATION_TASK)) {
      await Location.stopLocationUpdatesAsync(DRIVER_LOCATION_TASK);
    }
  } catch {
    // La tarea ya no estaba registrada.
  }
}
