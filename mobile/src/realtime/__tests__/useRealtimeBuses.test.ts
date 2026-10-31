import { act, renderHook } from '@testing-library/react-native';

import { applyBusUpdate, latencyOf } from '../liveBuses';
import { RealtimeClient } from '../RealtimeClient';
import type { BusUpdatePayload, ConnectionStatus, IncomingMessage } from '../types';
import { useRealtimeBuses } from '../useRealtimeBuses';

const update = (overrides: Partial<BusUpdatePayload> = {}): BusUpdatePayload => ({
  busId: 'bus-1',
  routeId: 'route-7A',
  latitude: -38.7359,
  longitude: -72.5904,
  heading: 90,
  speed: 30,
  currentPassengers: 20,
  capacity: 40,
  timestamp: '2026-10-29T12:00:00.000Z',
  ...overrides,
});

describe('applyBusUpdate (igual que useSocketBuses del web)', () => {
  it('agrega una micro nueva con el nombre de su ruta', () => {
    const buses = applyBusUpdate([], update(), 1000);

    expect(buses).toHaveLength(1);
    expect(buses[0]).toMatchObject({
      id: 'bus-1',
      routeName: 'Línea 7A — Hualpén / Centro / Las Américas',
      status: 'ACTIVE',
      lastUpdate: 1000,
      boardings: 0,
    });
  });

  it('actualiza la micro existente y conserva lo que el mensaje no trae', () => {
    const first = applyBusUpdate([], update({ boardings: 5 }), 1000);
    const next = applyBusUpdate(first, update({ latitude: -38.74, boardings: undefined, currentPassengers: 25 }), 2000);

    expect(next).toHaveLength(1);
    expect(next[0]).toMatchObject({ latitude: -38.74, currentPassengers: 25, boardings: 5, lastUpdate: 2000 });
    expect(first[0].latitude).toBe(-38.7359); // no modifica la lista anterior
  });

  it('una ruta real de la base usa el nombre que se le entrega', () => {
    const [bus] = applyBusUpdate([], update({ routeId: 'route-demo' }), 0, { 'route-demo': 'Línea L1-DEMO — Línea 1 Centro' });
    expect(bus.routeName).toBe('Línea L1-DEMO — Línea 1 Centro');
  });

  it('una ruta desconocida usa "Ruta <id>" y la capacidad por defecto del web', () => {
    const [bus] = applyBusUpdate([], { ...update({ routeId: 'route-9' }), capacity: undefined as unknown as number }, 0);
    expect(bus).toMatchObject({ routeName: 'Ruta route-9', capacity: 80 });
  });

  it('latencia: hora local menos la del servidor, nunca negativa', () => {
    const server = Date.parse('2026-10-29T12:00:00.000Z');
    expect(latencyOf(update(), server + 250)).toBe(250);
    expect(latencyOf(update(), server - 100)).toBe(0);
    expect(latencyOf(update({ timestamp: 'no es fecha' }), server)).toBeNull();
  });
});

/** Cliente falso controlado por el test. */
class FakeClient {
  statusHandler: ((s: ConnectionStatus) => void) | null = null;
  messageHandler: ((m: IncomingMessage) => void) | null = null;
  subscribed: string[] = [];
  connected = false;
  disconnected = false;
  onStatus(h: (s: ConnectionStatus) => void) {
    this.statusHandler = h;
    return () => (this.statusHandler = null);
  }
  onMessage(h: (m: IncomingMessage) => void) {
    this.messageHandler = h;
    return () => (this.messageHandler = null);
  }
  connect() {
    this.connected = true;
    this.connectCount += 1;
    this.statusHandler?.('connecting');
  }
  unsubscribed: string[] = [];
  connectCount = 0;
  subscribe(_topic: string, id: string) {
    this.subscribed.push(id);
  }
  unsubscribe(_topic: string, id: string) {
    this.unsubscribed.push(id);
  }
  disconnect() {
    this.disconnected = true;
  }
}

describe('useRealtimeBuses', () => {
  beforeEach(() => jest.useFakeTimers({ now: Date.parse('2026-10-29T12:00:01.000Z') }));
  afterEach(() => jest.useRealTimers());

  async function renderWithFake() {
    const fake = new FakeClient();
    const hook = await renderHook(() => useRealtimeBuses({ createClient: () => fake as unknown as RealtimeClient }));
    return { fake, hook };
  }

  it('se conecta y se suscribe a las líneas 7A, 7B y 1C, como el web', async () => {
    const { fake, hook } = await renderWithFake();

    expect(fake.connected).toBe(true);
    expect(fake.subscribed).toEqual(['route-7A', 'route-7B', 'route-1C']);
    expect(hook.result.current.status).toBe('connecting');
    await act(async () => fake.statusHandler?.('connected'));
    expect(hook.result.current.status).toBe('connected');
  });

  it('cada bus:update actualiza las micros, la latencia y los contadores', async () => {
    const { fake, hook } = await renderWithFake();

    await act(async () => {
      fake.messageHandler?.({ type: 'bus:update', data: update() });
      fake.messageHandler?.({ type: 'bus:update', data: update({ busId: 'bus-2', routeId: 'route-1C' }) });
      fake.messageHandler?.({ type: 'error', code: 'X', message: 'ignorado' });
    });

    expect(hook.result.current.buses.map((b) => b.id)).toEqual(['bus-1', 'bus-2']);
    expect(hook.result.current.latencyMs).toBe(1000);
    expect(hook.result.current.totalMessages).toBe(2);

    await act(async () => jest.advanceTimersByTime(1000));
    expect(hook.result.current.messagesPerSecond).toBe(2);
    await act(async () => jest.advanceTimersByTime(1000));
    expect(hook.result.current.messagesPerSecond).toBe(0);
  });

  it('al desmontarse cierra la conexión', async () => {
    const { fake, hook } = await renderWithFake();

    await hook.unmount();

    expect(fake.disconnected).toBe(true);
    expect(fake.messageHandler).toBeNull();
  });

  it('desactivado no se conecta', async () => {
    const fake = new FakeClient();
    await renderHook(() => useRealtimeBuses({ enabled: false, createClient: () => fake as unknown as RealtimeClient }));

    expect(fake.connected).toBe(false);
  });

  it('agregar o quitar rutas suscribe y desuscribe sin cortar la conexión', async () => {
    const fake = new FakeClient();
    const { rerender } = await renderHook(
      ({ routeIds }: { routeIds: string[] }) => useRealtimeBuses({ routeIds, createClient: () => fake as unknown as RealtimeClient }),
      { initialProps: { routeIds: ['route-7A'] } },
    );

    await rerender({ routeIds: ['route-7A', 'route-demo'] });
    await rerender({ routeIds: ['route-demo'] });

    expect(fake.connectCount).toBe(1);
    expect(fake.disconnected).toBe(false);
    expect(fake.subscribed).toEqual(['route-7A', 'route-demo']);
    expect(fake.unsubscribed).toEqual(['route-7A']);
  });
});
