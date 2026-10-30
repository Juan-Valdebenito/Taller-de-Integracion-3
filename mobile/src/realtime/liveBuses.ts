/**
 * Estado de cada micro en el mapa, como BusState del web
 * (frontend/src/hooks/useSimulatedBuses.ts), y cómo se actualiza con cada
 * mensaje bus:update (misma lógica que useSocketBuses del web).
 */
import type { BusStatus } from '../theme/status';
import type { BusUpdatePayload, OccupancyInfo } from './types';

export interface LiveBus {
  id: string;
  routeId: string;
  routeName: string;
  latitude: number;
  longitude: number;
  /** Rumbo en grados (0 = norte). */
  heading: number;
  /** km/h */
  speed: number;
  currentPassengers: number;
  capacity: number;
  boardings: number;
  alightings: number;
  studentBoardings: number;
  rejectedBoardings: number;
  totalBoardings: number;
  totalAlightings: number;
  totalStudents: number;
  status: BusStatus;
  /** Última actualización (ms desde 1970). */
  lastUpdate: number;
  /** Ocupación calculada por el backend, si la envía. */
  occupancy?: OccupancyInfo;
}

/** Rutas a las que se suscribe el mapa, como el web. */
export const DEFAULT_ROUTE_IDS = ['route-7A', 'route-7B', 'route-1C'] as const;

export const ROUTE_NAMES: Readonly<Record<string, string>> = {
  'route-7A': 'Línea 7A — Hualpén / Centro / Las Américas',
  'route-7B': 'Línea 7B — Pedro de Valdivia / Centro / Amanecer',
  'route-1C': 'Línea 1C — Padre Las Casas / Centro / Labranza',
};

/** Capacidad que asume el web cuando el mensaje no la trae. */
const DEFAULT_CAPACITY = 80;

/** Agrega la micro del mensaje o actualiza la que ya está (devuelve una lista nueva). */
export function applyBusUpdate(buses: readonly LiveBus[], data: BusUpdatePayload, now: number): LiveBus[] {
  const index = buses.findIndex((bus) => bus.id === data.busId);
  if (index === -1) {
    return [
      ...buses,
      {
        id: data.busId,
        routeId: data.routeId,
        routeName: ROUTE_NAMES[data.routeId] ?? `Ruta ${data.routeId}`,
        latitude: data.latitude,
        longitude: data.longitude,
        heading: data.heading ?? 0,
        speed: data.speed ?? 0,
        currentPassengers: data.currentPassengers ?? 0,
        capacity: data.capacity ?? DEFAULT_CAPACITY,
        boardings: data.boardings ?? 0,
        alightings: data.alightings ?? 0,
        studentBoardings: data.studentBoardings ?? 0,
        rejectedBoardings: data.rejectedBoardings ?? 0,
        totalBoardings: data.totalBoardings ?? 0,
        totalAlightings: data.totalAlightings ?? 0,
        totalStudents: data.totalStudents ?? 0,
        status: 'ACTIVE',
        lastUpdate: now,
        occupancy: data.occupancy,
      },
    ];
  }
  const bus = buses[index];
  const updated: LiveBus = {
    ...bus,
    latitude: data.latitude,
    longitude: data.longitude,
    heading: data.heading ?? bus.heading,
    speed: data.speed ?? bus.speed,
    currentPassengers: data.currentPassengers ?? bus.currentPassengers,
    capacity: data.capacity ?? bus.capacity,
    boardings: data.boardings ?? bus.boardings,
    alightings: data.alightings ?? bus.alightings,
    studentBoardings: data.studentBoardings ?? bus.studentBoardings,
    rejectedBoardings: data.rejectedBoardings ?? bus.rejectedBoardings,
    totalBoardings: data.totalBoardings ?? bus.totalBoardings,
    totalAlightings: data.totalAlightings ?? bus.totalAlightings,
    totalStudents: data.totalStudents ?? bus.totalStudents,
    status: 'ACTIVE',
    lastUpdate: now,
    occupancy: data.occupancy,
  };
  return buses.map((b, i) => (i === index ? updated : b));
}

/** Latencia estimada: hora local menos la del servidor (0 si viene adelantada). */
export function latencyOf(data: BusUpdatePayload, now: number): number | null {
  const serverTime = Date.parse(data.timestamp);
  return Number.isFinite(serverTime) ? Math.max(0, now - serverTime) : null;
}
