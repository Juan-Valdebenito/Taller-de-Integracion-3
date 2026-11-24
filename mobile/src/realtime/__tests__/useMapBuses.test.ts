import { act, renderHook } from '@testing-library/react-native';

import { RealtimeClient } from '../RealtimeClient';
import type { ConnectionStatus, IncomingMessage } from '../types';
import { useMapBuses } from '../useMapBuses';

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

  const busUpdate: IncomingMessage = {
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
  };

  it('sin conexión no muestra micros, aunque pase el tiempo', async () => {
    const { hook } = await renderMapBuses();
    expect(hook.result.current).toMatchObject({ live: false, buses: [] });

    await act(async () => jest.advanceTimersByTime(10000));

    expect(hook.result.current).toMatchObject({ live: false, buses: [] });
  });

  it('con conexión, pero sin micros en vivo, tampoco inventa ninguna', async () => {
    const { fake, hook } = await renderMapBuses();

    await act(async () => fake.statusHandler?.('connected'));

    expect(hook.result.current).toMatchObject({ live: true, buses: [] });
  });

  it('con conexión muestra las micros del WebSocket, sin moverlas por su cuenta', async () => {
    const { fake, hook } = await renderMapBuses();

    await act(async () => {
      fake.statusHandler?.('connected');
      fake.messageHandler?.(busUpdate);
    });
    expect(hook.result.current.live).toBe(true);
    expect(hook.result.current.buses.map((b) => b.id)).toEqual(['bus-real']);

    await act(async () => jest.advanceTimersByTime(10000));

    expect(hook.result.current.buses[0]).toMatchObject({ latitude: -38.73, longitude: -72.59 });
  });

  it('si se cae la conexión deja de mostrarlas', async () => {
    const { fake, hook } = await renderMapBuses();
    await act(async () => {
      fake.statusHandler?.('connected');
      fake.messageHandler?.(busUpdate);
    });
    expect(hook.result.current.buses).toHaveLength(1);

    await act(async () => fake.statusHandler?.('disconnected'));

    expect(hook.result.current).toMatchObject({ live: false, buses: [] });
  });
});
