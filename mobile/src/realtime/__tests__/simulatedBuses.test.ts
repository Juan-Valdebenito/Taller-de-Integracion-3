import { act, renderHook } from '@testing-library/react-native';

import { RealtimeClient } from '../RealtimeClient';
import { initialSimulatedBuses, stepSimulatedBus, TEMUCO_BOUNDS } from '../simulatedBuses';
import type { ConnectionStatus, IncomingMessage } from '../types';
import { useMapBuses, useSimulatedBuses } from '../useMapBuses';

/** Generador "al azar" con una secuencia fija, para resultados predecibles. */
const sequence = (...values: number[]) => {
  let i = 0;
  return () => values[i++ % values.length];
};

describe('micros simuladas (iguales al web)', () => {
  it('parte con una micro por línea, con los valores del web', () => {
    const buses = initialSimulatedBuses(1000);

    expect(buses.map((b) => [b.id, b.routeId, b.status, b.capacity])).toEqual([
      ['sim-route-7A-1', 'route-7A', 'ACTIVE', 45],
      ['sim-route-7B-1', 'route-7B', 'ACTIVE', 45],
      ['sim-route-1C-1', 'route-1C', 'DELAYED', 40],
    ]);
    expect(buses[0]).toMatchObject({ latitude: -38.7278, longitude: -72.6175, currentPassengers: 18, lastUpdate: 1000 });
    expect(buses[2].routeName).toBe('Línea 1C — Padre Las Casas / Centro / Labranza');
  });

  it('cada paso mueve la micro, la gira hacia donde se movió y cambia sus pasajeros', () => {
    const [bus] = initialSimulatedBuses(0);
    // 1.0 → +0.0012 en latitud; 0.5 → sin cambio en longitud; pasajeros floor((0.9-0.4)*4) = +2.
    const next = stepSimulatedBus(bus, 2000, sequence(0.9, 1, 0.5, 0.5));

    expect(next.latitude).toBeCloseTo(bus.latitude + 0.0012, 6);
    expect(next.longitude).toBeCloseTo(bus.longitude, 6);
    expect(next.heading).toBeCloseTo(0, 6); // se movió al norte
    expect(next.speed).toBe(15 + 0.5 * 40);
    expect(next.currentPassengers).toBe(20);
    expect(next.lastUpdate).toBe(2000);
  });

  it('no sale de los límites de Temuco ni pasa la capacidad', () => {
    const [bus] = initialSimulatedBuses(0);
    const edge = { ...bus, latitude: TEMUCO_BOUNDS.latMax, longitude: TEMUCO_BOUNDS.lngMin, currentPassengers: bus.capacity };

    const next = stepSimulatedBus(edge, 0, sequence(0.99, 0.99, 0.0, 0.5));

    expect(next.latitude).toBeLessThanOrEqual(TEMUCO_BOUNDS.latMax);
    expect(next.longitude).toBeGreaterThanOrEqual(TEMUCO_BOUNDS.lngMin);
    expect(next.currentPassengers).toBeLessThanOrEqual(bus.capacity);
  });

  it('una micro detenida arranca con 20 % de probabilidad', () => {
    const stopped = { ...initialSimulatedBuses(0)[0], status: 'STOPPED' as const, speed: 0 };

    expect(stepSimulatedBus(stopped, 0, sequence(0.1, 0.5))).toMatchObject({ status: 'ACTIVE', speed: 20 + 0.5 * 25 });
    const stillStopped = stepSimulatedBus(stopped, 0, sequence(0.9, 0.5, 0.5, 0.5, 0.5));
    expect(stillStopped).toMatchObject({ status: 'STOPPED', speed: 0 });
  });
});

describe('useSimulatedBuses', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('mueve las micros cada 2 s mientras está activa', async () => {
    const { result } = await renderHook(() => useSimulatedBuses(true));
    const start = result.current[0].latitude;

    await act(async () => jest.advanceTimersByTime(2000));

    expect(result.current[0].latitude).not.toBe(start);
  });

  it('desactivada no las mueve', async () => {
    const { result } = await renderHook(() => useSimulatedBuses(false));
    const start = result.current.map((b) => b.latitude);

    await act(async () => jest.advanceTimersByTime(10000));

    expect(result.current.map((b) => b.latitude)).toEqual(start);
  });
});

/** Cliente WebSocket falso para elegir el estado de la conexión. */
class FakeClient {
  statusHandler: ((s: ConnectionStatus) => void) | null = null;
  messageHandler: ((m: IncomingMessage) => void) | null = null;
  onStatus(h: (s: ConnectionStatus) => void) {
    this.statusHandler = h;
    return () => undefined;
  }
  onMessage(h: (m: IncomingMessage) => void) {
    this.messageHandler = h;
    return () => undefined;
  }
  connect() {
    this.statusHandler?.('connecting');
  }
  subscribe() {}
  disconnect() {}
}

describe('useMapBuses (misma regla que el web)', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  async function renderMapBuses() {
    const fake = new FakeClient();
    const hook = await renderHook(() => useMapBuses({ createClient: () => fake as unknown as RealtimeClient }));
    return { fake, hook };
  }

  it('sin conexión muestra las micros simuladas', async () => {
    const { hook } = await renderMapBuses();

    expect(hook.result.current.source).toBe('simulated');
    expect(hook.result.current.buses.map((b) => b.id)).toEqual(['sim-route-7A-1', 'sim-route-7B-1', 'sim-route-1C-1']);
  });

  it('con el WebSocket conectado muestra sus micros y deja de simular', async () => {
    const { fake, hook } = await renderMapBuses();

    await act(async () => {
      fake.statusHandler?.('connected');
      fake.messageHandler?.({
        type: 'bus:update',
        data: {
          busId: 'bus-real',
          routeId: 'route-7B',
          latitude: -38.73,
          longitude: -72.59,
          heading: 0,
          speed: 20,
          currentPassengers: 10,
          capacity: 40,
          timestamp: new Date().toISOString(),
        },
      });
    });

    expect(hook.result.current.source).toBe('realtime');
    expect(hook.result.current.buses.map((b) => b.id)).toEqual(['bus-real']);
  });

  it('si se cae la conexión vuelve a las simuladas', async () => {
    const { fake, hook } = await renderMapBuses();
    await act(async () => fake.statusHandler?.('connected'));
    expect(hook.result.current.source).toBe('realtime');

    await act(async () => fake.statusHandler?.('disconnected'));

    expect(hook.result.current.source).toBe('simulated');
    expect(hook.result.current.buses).toHaveLength(3);
  });
});
