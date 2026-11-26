/** Fixtures usados por pruebas automatizadas. */
import type { LiveBus } from './liveBuses';

const TEST_ROUTE_NAMES: Readonly<Record<string, string>> = {
  'route-7A': 'Línea de prueba 7A',
  'route-7B': 'Línea de prueba 7B',
  'route-1C': 'Línea de prueba 1C',
};

/** Una posición de Temuco para cada micro de ejemplo. */
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
    routeName: TEST_ROUTE_NAMES[routeId],
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
    dataSource: 'simulation',
    ...values,
  };
}

/** Las 3 micros de ejemplo. */
export function initialSimulatedBuses(now: number): LiveBus[] {
  return [
    startBus('route-7A', { heading: 180, speed: 35, currentPassengers: 18, capacity: 45, status: 'ACTIVE' }),
    startBus('route-7B', { heading: 0, speed: 28, currentPassengers: 27, capacity: 45, status: 'ACTIVE' }),
    startBus('route-1C', { heading: 135, speed: 40, currentPassengers: 22, capacity: 40, status: 'DELAYED' }),
  ].map((bus) => ({ ...bus, lastUpdate: now }));
}
