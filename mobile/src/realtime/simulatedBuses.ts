/**
 * Micros simuladas de respaldo, iguales a las del frontend web
 * (frontend/src/hooks/useSimulatedBuses.ts): una por línea, que se mueven al
 * azar dentro de Temuco cada 2 s, para mostrar algo mientras no hay conexión
 * en tiempo real.
 */
import type { LiveBus } from './liveBuses';
import { ROUTE_NAMES } from './liveBuses';

export const SIMULATION_INTERVAL_MS = 2000;

/** Límites aproximados de Temuco, para que no salgan del mapa. */
export const TEMUCO_BOUNDS = { latMin: -38.8, latMax: -38.7, lngMin: -72.65, lngMax: -72.55 } as const;

/** Primer punto del recorrido de cada línea en el web (posición de partida). */
const START: Readonly<Record<string, [number, number]>> = {
  'route-7A': [-38.7278, -72.6175],
  'route-7B': [-38.7085, -72.582],
  'route-1C': [-38.7775, -72.5692],
};

function startBus(
  routeId: keyof typeof START,
  values: Pick<LiveBus, 'heading' | 'speed' | 'currentPassengers' | 'capacity' | 'status'>,
): LiveBus {
  const [latitude, longitude] = START[routeId];
  return {
    id: `sim-${routeId}-1`,
    routeId,
    routeName: ROUTE_NAMES[routeId],
    latitude,
    longitude,
    boardings: 0,
    alightings: 0,
    studentBoardings: 0,
    rejectedBoardings: 0,
    totalBoardings: 0,
    totalAlightings: 0,
    totalStudents: 0,
    lastUpdate: 0,
    ...values,
  };
}

/** Las 3 micros iniciales del web. */
export function initialSimulatedBuses(now: number): LiveBus[] {
  return [
    startBus('route-7A', { heading: 180, speed: 35, currentPassengers: 18, capacity: 45, status: 'ACTIVE' }),
    startBus('route-7B', { heading: 0, speed: 28, currentPassengers: 27, capacity: 45, status: 'ACTIVE' }),
    startBus('route-1C', { heading: 135, speed: 40, currentPassengers: 22, capacity: 40, status: 'DELAYED' }),
  ].map((bus) => ({ ...bus, lastUpdate: now }));
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

/**
 * Un paso de la simulación (mismas reglas que el web): una micro detenida
 * arranca con 20 % de probabilidad; si no, se mueve ~50–150 m al azar dentro
 * de Temuco, gira hacia donde se movió y suben o bajan de 1 a 3 pasajeros.
 * `random` devuelve números en [0, 1), como Math.random.
 */
export function stepSimulatedBus(bus: LiveBus, now: number, random: () => number = Math.random): LiveBus {
  if (bus.status === 'STOPPED' && random() < 0.2) {
    return { ...bus, status: 'ACTIVE', speed: 20 + random() * 25 };
  }
  const nudge = (value: number) => value + (random() - 0.5) * 2 * 0.0012;
  const passengerDelta = Math.floor((random() - 0.4) * 4);
  const latitude = clamp(nudge(bus.latitude), TEMUCO_BOUNDS.latMin, TEMUCO_BOUNDS.latMax);
  const longitude = clamp(nudge(bus.longitude), TEMUCO_BOUNDS.lngMin, TEMUCO_BOUNDS.lngMax);
  return {
    ...bus,
    latitude,
    longitude,
    heading: (Math.atan2(longitude - bus.longitude, latitude - bus.latitude) * 180) / Math.PI,
    speed: bus.status === 'STOPPED' ? 0 : 15 + random() * 40,
    currentPassengers: clamp(bus.currentPassengers + passengerDelta, 0, bus.capacity),
    lastUpdate: now,
  };
}
