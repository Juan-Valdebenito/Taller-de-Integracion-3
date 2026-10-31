import type { BusPosition } from '../../api/busesApi';
import type { ProximityResult, Stop } from '../../location/geo';
import { initialSimulatedBuses } from '../../realtime/simulatedBuses';
import { alertMessage, alertStop, alertsPausedReason, findApproachingBuses, liveBusesToPositions, nextAlerts } from '../proximityAlerts';

const STOP: Stop = { id: 'p1', name: 'Plaza de Armas', latitude: -38.7359, longitude: -72.5904 };
const NOW = 1_000_000;
const north = (meters: number) => STOP.latitude + meters / 111_195;
const bus = (id: string, meters: number, ageMs = 0, patente = id.toUpperCase()): BusPosition => ({
  id,
  patente,
  latitude: north(meters),
  longitude: STOP.longitude,
  speed: null,
  locationAt: NOW - ageMs,
  routeId: null,
});
const proximity = (status: ProximityResult['status']): ProximityResult => ({
  status,
  nearest: status === 'no-stops' ? null : { stop: STOP, distanceMeters: 40 },
  radiusMeters: 100,
});
const options = { alertRadiusMeters: 500, maxAgeMs: 120_000, now: NOW };

describe('alertStop: alertas solo con el paradero verificado', () => {
  it('dentro del radio devuelve el paradero', () => {
    expect(alertStop(proximity('inside'))).toBe(STOP);
  });

  it.each(['outside', 'low-accuracy', 'no-stops'] as const)('%s → sin alertas', (status) => {
    expect(alertStop(proximity(status))).toBeNull();
  });

  it('sin verificación todavía → sin alertas', () => {
    expect(alertStop(null)).toBeNull();
  });
});

describe('alertsPausedReason', () => {
  it('activas: sin motivo de pausa', () => {
    expect(alertsPausedReason(proximity('inside'))).toBeNull();
  });

  it.each([
    [null, /Necesitamos tu ubicación/],
    [proximity('outside'), /menos de 100 m/],
    [proximity('low-accuracy'), /precisión/],
    [proximity('no-stops'), /No hay paraderos/],
  ])('%#: explica el motivo', (value, expected) => {
    expect(alertsPausedReason(value)).toMatch(expected);
  });
});

describe('findApproachingBuses', () => {
  it('solo micros dentro del radio de alerta, la más cercana primero', () => {
    const result = findApproachingBuses(STOP, [bus('lejos', 900), bus('b', 300), bus('a', 120)], options);
    expect(result.map((r) => r.bus.id)).toEqual(['a', 'b']);
    expect(result[0].distanceMeters).toBeCloseTo(120, 0);
  });

  it('ignora micros con posición antigua', () => {
    const result = findApproachingBuses(STOP, [bus('vieja', 100, 5 * 60_000), bus('reciente', 200, 30_000)], options);
    expect(result.map((r) => r.bus.id)).toEqual(['reciente']);
  });
});

describe('nextAlerts', () => {
  const near = (ids: string[]) => ids.map((id) => ({ bus: bus(id, 100), distanceMeters: 100 }));

  it('alerta solo las micros nuevas en el radio', () => {
    const { fresh, notified } = nextAlerts(near(['a', 'b']), new Set(['a']));
    expect(fresh.map((f) => f.bus.id)).toEqual(['b']);
    expect([...notified]).toEqual(['a', 'b']);
  });

  it('una micro que sale del radio se olvida y vuelve a alertar si regresa', () => {
    const afterLeaving = nextAlerts(near([]), new Set(['a'])).notified;
    expect(afterLeaving.size).toBe(0);
    expect(nextAlerts(near(['a']), afterLeaving).fresh).toHaveLength(1);
  });
});

describe('alertMessage', () => {
  it('con patente', () => {
    expect(alertMessage(STOP, { bus: bus('b1', 0, 0, 'ABCD12'), distanceMeters: 350 })).toBe(
      'La micro ABCD12 está a 350 m de Plaza de Armas.',
    );
  });

  it('sin patente', () => {
    expect(alertMessage(STOP, { bus: bus('b1', 0, 0, ''), distanceMeters: 1200 })).toBe('Una micro está a 1,2 km de Plaza de Armas.');
  });
});

describe('liveBusesToPositions', () => {
  it('convierte las micros del tiempo real: identificador como patente y antigüedad del último mensaje', () => {
    const [live] = initialSimulatedBuses(NOW);
    expect(liveBusesToPositions([live])).toEqual([
      { id: live.id, patente: live.id, latitude: live.latitude, longitude: live.longitude, speed: live.speed, locationAt: NOW, routeId: live.routeId },
    ]);
  });
});
