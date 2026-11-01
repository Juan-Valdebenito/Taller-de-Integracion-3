import { ROUTE_NODES } from '../../components/map/routeNodes';
import { distanceInMeters } from '../../location/geo';
import type { LiveBus } from '../../realtime/liveBuses';
import { initialSimulatedBuses } from '../../realtime/simulatedBuses';
import { computeEta, formatEta, isAhead, TORTUOSITY } from '../useEta';

// Micro de la 7A entre Diego Portales (al este) y Campus San Francisco (al oeste), a 36 km/h (10 m/s).
const bus: LiveBus = { ...initialSimulatedBuses(0)[0], routeId: 'route-7A', latitude: -38.7365, longitude: -72.595, speed: 36, heading: 90, status: 'ACTIVE' };
const stop = (id: string) => ROUTE_NODES.find((node) => node.id === id)!;

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

  it('calcula los paraderos de la línea: distancia × 1,35 y tiempo con la velocidad', () => {
    const { allStops, isStopped } = computeEta(bus);

    expect(isStopped).toBe(false);
    expect(allStops.map((s) => s.stopId)).toEqual(ROUTE_NODES.filter((n) => n.routeIds.includes('route-7A')).map((n) => n.id));
    const portales = allStops.find((s) => s.stopId === 'PAR-DPORT-01')!;
    const expected = distanceInMeters(bus, { latitude: stop('PAR-DPORT-01').position[0], longitude: stop('PAR-DPORT-01').position[1] }) * TORTUOSITY;
    expect(portales.distanceM).toBeCloseTo(expected, 6);
    expect(portales.etaSeconds).toBeCloseTo(expected / 10, 6);
    expect(portales.etaLabel).toBe(formatEta(expected / 10));
  });

  it('el próximo paradero es el más cercano por delante según el rumbo', () => {
    expect(computeEta(bus).nextStop?.stopName).toBe('Diego Portales / McDonalds');
    expect(computeEta({ ...bus, heading: 270 }).nextStop?.stopName).toBe('Avenida Alemania / Campus San Francisco');
  });

  it('detenida (≤ 1 km/h o STOPPED) no tiene tiempo de llegada', () => {
    for (const stopped of [{ ...bus, speed: 1 }, { ...bus, status: 'STOPPED' as const }]) {
      const result = computeEta(stopped);
      expect(result.isStopped).toBe(true);
      expect(result.allStops.every((s) => s.etaSeconds === null && s.etaLabel === '—')).toBe(true);
    }
  });

  it('sin micro o con una línea sin paraderos no hay próximo paradero', () => {
    expect(computeEta(null)).toEqual({ nextStop: null, allStops: [], isStopped: false });
    expect(computeEta({ ...bus, routeId: 'route-99' })).toEqual({ nextStop: null, allStops: [], isStopped: false });
  });
});
