import type { LiveRouteStop } from '../../realtime/liveBuses';
import type { LiveBus } from '../../realtime/liveBuses';
import { initialSimulatedBuses } from '../../realtime/simulatedBuses';
import { distanceInMeters } from '../../location/geo';
import { computeEta, formatEta, isAhead, TORTUOSITY } from '../useEta';

// Fixtures explícitos de prueba; la app solo entrega paraderos recibidos del backend.
const routeStops: LiveRouteStop[] = [
  { id: 'stop-portales', name: 'Diego Portales', latitude: -38.737505, longitude: -72.589278, order: 1 },
  { id: 'stop-alemania', name: 'Campus San Francisco', latitude: -38.736937, longitude: -72.601303, order: 2 },
];
const bus: LiveBus = {
  ...initialSimulatedBuses(0)[0],
  routeId: 'route-live',
  latitude: -38.7365,
  longitude: -72.595,
  speed: 36,
  heading: 90,
  status: 'ACTIVE',
};

describe('useEta', () => {
  it('formatea el tiempo como el web', () => {
    expect(formatEta(44.6)).toBe('45 seg');
    expect(formatEta(240)).toBe('4 min');
    expect(formatEta(3600)).toBe('1 h');
    expect(formatEta(3900)).toBe('1 h 5 min');
  });

  it('un paradero está por delante si queda a menos de 90° del rumbo', () => {
    expect(isAhead({ latitude: 0, longitude: 0, heading: 90 }, [0, 1])).toBe(true);
    expect(isAhead({ latitude: 0, longitude: 0, heading: 90 }, [0, -1])).toBe(false);
    expect(isAhead({ latitude: 0, longitude: 0, heading: 0 }, [1, 0.5])).toBe(true);
    expect(isAhead({ latitude: 0, longitude: 0, heading: 0 }, [0, 0])).toBe(false);
  });

  it('calcula ETA usando solo los paraderos recibidos para la ruta', () => {
    const { allStops, isStopped } = computeEta(bus, routeStops);

    expect(isStopped).toBe(false);
    expect(allStops.map((stop) => stop.stopId)).toEqual(['stop-portales', 'stop-alemania']);
    const portales = allStops[0];
    const expected = distanceInMeters(bus, { latitude: routeStops[0].latitude, longitude: routeStops[0].longitude }) * TORTUOSITY;
    expect(portales.distanceM).toBeCloseTo(expected, 6);
    expect(portales.etaSeconds).toBeCloseTo(expected / 10, 6);
    expect(portales.etaLabel).toBe(formatEta(expected / 10));
  });

  it('el próximo paradero es el más cercano por delante según el rumbo', () => {
    expect(computeEta(bus, routeStops).nextStop?.stopName).toBe('Diego Portales');
    expect(computeEta({ ...bus, heading: 270 }, routeStops).nextStop?.stopName).toBe('Campus San Francisco');
  });

  it('detenida no tiene tiempo de llegada', () => {
    for (const stopped of [{ ...bus, speed: 1 }, { ...bus, status: 'STOPPED' as const }]) {
      const result = computeEta(stopped, routeStops);
      expect(result.isStopped).toBe(true);
      expect(result.allStops.every((stop) => stop.etaSeconds === null && stop.etaLabel === '—')).toBe(true);
    }
  });

  it('sin micro o sin paraderos reales no inventa un próximo paradero', () => {
    expect(computeEta(null)).toEqual({ nextStop: null, allStops: [], isStopped: false });
    expect(computeEta(bus)).toEqual({ nextStop: null, allStops: [], isStopped: false });
  });
});
