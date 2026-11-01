/**
 * Reglas de las alertas de proximidad (funciones puras). Las alertas solo se
 * emiten cuando la verificación de geolocalización confirmó que el usuario
 * está dentro del radio de un paradero oficial.
 */
import type { BusPosition } from '../api/busesApi';
import { distanceInMeters, formatDistance, type ProximityResult, type Stop } from '../location/geo';
import type { LiveBus } from '../realtime/liveBuses';

/**
 * Micros del tiempo real como posiciones para las alertas. El WebSocket no
 * trae la patente, así que se usa el identificador que muestran el mapa y la
 * lista; la antigüedad es la del último mensaje recibido.
 */
export function liveBusesToPositions(buses: readonly LiveBus[]): BusPosition[] {
  return buses.map((bus) => ({
    id: bus.id,
    patente: bus.id,
    latitude: bus.latitude,
    longitude: bus.longitude,
    speed: bus.speed,
    locationAt: bus.lastUpdate,
    routeId: bus.routeId,
  }));
}

/** Paradero en el que se permiten alertas, o null si la verificación no lo confirma. */
export function alertStop(proximity: ProximityResult | null): Stop | null {
  return proximity?.status === 'inside' && proximity.nearest ? proximity.nearest.stop : null;
}

/** Por qué las alertas están en pausa (null si están activas). */
export function alertsPausedReason(proximity: ProximityResult | null): string | null {
  if (!proximity) {
    return 'Necesitamos tu ubicación y los paraderos cercanos para activar las alertas.';
  }
  switch (proximity.status) {
    case 'inside':
      return null;
    case 'outside':
      return `Acércate a menos de ${formatDistance(proximity.radiusMeters)} de un paradero oficial para recibir alertas.`;
    case 'low-accuracy':
      return 'La precisión de tu ubicación no permite confirmar que estás en el paradero.';
    case 'no-stops':
      return 'No hay paraderos oficiales cerca de tu ubicación.';
  }
}

export interface ApproachingBus {
  bus: BusPosition;
  /** Distancia de la micro al paradero (m). */
  distanceMeters: number;
}

export interface ApproachingOptions {
  alertRadiusMeters: number;
  /** Antigüedad máxima del último reporte de posición (ms). */
  maxAgeMs: number;
  now: number;
}

/** Micros con posición reciente a menos de `alertRadiusMeters` del paradero, la más cercana primero. */
export function findApproachingBuses(
  stop: Stop,
  buses: readonly BusPosition[],
  { alertRadiusMeters, maxAgeMs, now }: ApproachingOptions,
): ApproachingBus[] {
  return buses
    .filter((bus) => now - bus.locationAt <= maxAgeMs)
    .map((bus) => ({ bus, distanceMeters: distanceInMeters(stop, bus) }))
    .filter(({ distanceMeters }) => distanceMeters <= alertRadiusMeters)
    .sort((a, b) => a.distanceMeters - b.distanceMeters);
}

export interface ProximityAlert extends ApproachingBus {
  stop: Stop;
  message: string;
}

export function alertMessage(stop: Stop, { bus, distanceMeters }: ApproachingBus): string {
  const who = bus.patente ? `La micro ${bus.patente}` : 'Una micro';
  return `${who} está a ${formatDistance(distanceMeters)} de ${stop.name}.`;
}

/**
 * Micros que acaban de entrar al radio de alerta (no avisadas antes). Devuelve
 * también el nuevo conjunto de avisadas: una micro que sale del radio se olvida
 * y vuelve a alertar si regresa.
 */
export function nextAlerts(
  approaching: readonly ApproachingBus[],
  notified: ReadonlySet<string>,
): { fresh: ApproachingBus[]; notified: Set<string> } {
  return {
    fresh: approaching.filter(({ bus }) => !notified.has(bus.id)),
    notified: new Set(approaching.map(({ bus }) => bus.id)),
  };
}
