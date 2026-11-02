import { act, renderHook } from '@testing-library/react-native';

import type { CompanyBus } from '../../api/companyApi';
import * as interceptor from '../../api/interceptor';
import { bearingDegrees, buildPublishMessage, motionBetween } from '../../company/driverLocation';
import * as locationService from '../../location/locationService';
import { RealtimeClient, type SocketLike } from '../../realtime/RealtimeClient';
import * as tokenStorage from '../../storage/tokenStorage';
import { DRIVER_HEARTBEAT_MS, DRIVER_WATCH_INTERVAL_MS, useDriverLocation } from '../useDriverLocation';

jest.mock('../../location/locationService', () => ({ requestLocationPermission: jest.fn(), watchPosition: jest.fn() }));
jest.mock('../../storage/tokenStorage', () => ({ getAccessToken: jest.fn() }));
jest.mock('../../api/interceptor', () => ({ renewIfExpiringSoon: jest.fn() }));

class FakeSocket implements SocketLike {
  readyState = 0;
  sent: any[] = [];
  onopen: SocketLike['onopen'] = null;
  onmessage: SocketLike['onmessage'] = null;
  onclose: SocketLike['onclose'] = null;
  onerror: SocketLike['onerror'] = null;
  send(data: string) {
    this.sent.push(JSON.parse(data));
  }
  close() {
    this.readyState = 3;
    this.onclose?.({});
  }
  open() {
    this.readyState = 1;
    this.onopen?.({});
  }
}

const north = (meters: number) => -38.75 + meters / 111_195;
const bus: CompanyBus = { id: 'b1', patente: 'DEMO-01', capacity: 40, currentPassengers: 12, status: 'ACTIVE', companyId: 'co1', routeId: 'r1' };
const trip = { bus, route: { id: 'r1' } };

let socket: FakeSocket;
let emit: (p: locationService.UserPosition) => void;
const stopWatching = jest.fn();
const createClient = () => new RealtimeClient('ws://servidor/ws', () => (socket = new FakeSocket()));
const flush = () => act(async () => {});

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(locationService.requestLocationPermission).mockResolvedValue('granted');
  jest.mocked(locationService.watchPosition).mockImplementation(async (onPosition) => {
    emit = onPosition;
    return stopWatching;
  });
  jest.mocked(tokenStorage.getAccessToken).mockResolvedValue('jwt-empresa');
  jest.mocked(interceptor.renewIfExpiringSoon).mockResolvedValue(false);
});

describe('rumbo y velocidad', () => {
  it('calcula el rumbo entre dos puntos', () => {
    expect(Math.round(bearingDegrees({ latitude: 0, longitude: 0 }, { latitude: 1, longitude: 0 }))).toBe(0);
    expect(Math.round(bearingDegrees({ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 1 }))).toBe(90);
    expect(Math.round(bearingDegrees({ latitude: 0, longitude: 0 }, { latitude: -1, longitude: 0 }))).toBe(180);
  });

  it('100 m al norte en 10 s son 36 km/h con rumbo 0', () => {
    const a = { latitude: north(0), longitude: -72.6, timestamp: 0 };
    const b = { latitude: north(100), longitude: -72.6, timestamp: 10_000 };
    expect(motionBetween(a, b)).toEqual({ heading: 0, speed: 36 });
  });

  it('si casi no se movió (ruido del GPS), velocidad 0 y mantiene el rumbo', () => {
    const a = { latitude: north(0), longitude: -72.6, timestamp: 0 };
    const b = { latitude: north(3), longitude: -72.6, timestamp: 5_000 };
    expect(motionBetween(a, b, 270)).toEqual({ heading: 270, speed: 0 });
    expect(motionBetween(null, b, 45)).toEqual({ heading: 45, speed: 0 });
  });

  it('arma el mensaje publish que espera backend-go', () => {
    expect(buildPublishMessage('jwt', bus, 'r1', { latitude: -38.7, longitude: -72.6 }, { heading: 90, speed: 25 })).toEqual({
      type: 'publish',
      token: 'jwt',
      data: { busId: 'b1', routeId: 'r1', latitude: -38.7, longitude: -72.6, heading: 90, speed: 25, currentPassengers: 12, capacity: 40 },
    });
  });
});

describe('useDriverLocation', () => {
  it('sin recorrido no pide permiso ni se conecta', async () => {
    const { result } = await renderHook(() => useDriverLocation(null, { createClient }));
    await flush();

    expect(result.current.status).toBe('idle');
    expect(locationService.requestLocationPermission).not.toHaveBeenCalled();
  });

  it('en recorrido sigue el GPS seguido y publica cada posición con el token', async () => {
    const { result } = await renderHook(() => useDriverLocation(trip, { createClient }));
    await flush();
    expect(locationService.watchPosition).toHaveBeenCalledWith(
      expect.any(Function),
      expect.any(Function),
      expect.objectContaining({ timeIntervalMs: DRIVER_WATCH_INTERVAL_MS, highAccuracy: true }),
    );
    await act(async () => socket.open());
    expect(result.current.connection).toBe('connected');

    await act(async () => emit({ latitude: north(0), longitude: -72.6, accuracy: 5, timestamp: 0 }));
    await act(async () => emit({ latitude: north(100), longitude: -72.6, accuracy: 5, timestamp: 10_000 }));

    expect(result.current.status).toBe('tracking');
    expect(result.current.position).toEqual({ latitude: north(100), longitude: -72.6 });
    expect(result.current.sentCount).toBe(2);
    expect(result.current.lastSentAt).not.toBeNull();
    expect(socket.sent[1]).toMatchObject({ type: 'publish', token: 'jwt-empresa', data: { busId: 'b1', routeId: 'r1', speed: 36, heading: 0 } });
    expect(interceptor.renewIfExpiringSoon).toHaveBeenCalled();
  });

  it('sin conexión todavía, la posición sirve para el avance pero no cuenta como enviada', async () => {
    const { result } = await renderHook(() => useDriverLocation(trip, { createClient }));
    await flush();

    await act(async () => emit({ latitude: north(0), longitude: -72.6, accuracy: 5, timestamp: 0 }));

    expect(result.current.position).not.toBeNull();
    expect(result.current.sentCount).toBe(0);
  });

  it('sin permiso explica y "retry" lo vuelve a pedir', async () => {
    jest.mocked(locationService.requestLocationPermission).mockResolvedValueOnce('denied');
    const { result } = await renderHook(() => useDriverLocation(trip, { createClient }));
    await flush();

    expect(result.current.status).toBe('denied');
    expect(result.current.error).toMatch(/permiso de ubicación/);
    expect(locationService.watchPosition).not.toHaveBeenCalled();

    await act(async () => result.current.retry());
    await flush();
    expect(locationService.requestLocationPermission).toHaveBeenCalledTimes(2);
    expect(result.current.status).toBe('starting');
  });

  it('si el servidor rechaza la publicación muestra su motivo', async () => {
    const { result } = await renderHook(() => useDriverLocation(trip, { createClient }));
    await flush();
    await act(async () => socket.open());

    await act(async () => socket.onmessage?.({ data: JSON.stringify({ type: 'error', code: 'AUTH_REQUIRED', message: 'Token JWT inválido' }) }));

    expect(result.current.error).toBe('El servidor no aceptó la ubicación: Token JWT inválido');
  });

  it('al terminar el recorrido deja de seguir el GPS y cierra la conexión', async () => {
    const { result, rerender } = await renderHook(({ t }: { t: typeof trip | null }) => useDriverLocation(t, { createClient }), {
      initialProps: { t: trip as typeof trip | null },
    });
    await flush();
    await act(async () => socket.open());

    await rerender({ t: null });

    expect(stopWatching).toHaveBeenCalled();
    expect(socket.readyState).toBe(3);
    expect(result.current).toMatchObject({ status: 'idle', position: null, connection: 'disconnected', sentCount: 0 });
  });

  it('con la micro detenida reenvía la última posición cada 5 s (velocidad 0)', async () => {
    jest.useFakeTimers({ now: 0 });
    try {
      const { result } = await renderHook(() => useDriverLocation(trip, { createClient }));
      await flush();
      await act(async () => socket.open());
      await act(async () => emit({ latitude: north(0), longitude: -72.6, accuracy: 5, timestamp: 0 }));
      expect(result.current.sentCount).toBe(1);

      await act(async () => jest.advanceTimersByTime(DRIVER_HEARTBEAT_MS));
      await flush();
      await act(async () => jest.advanceTimersByTime(DRIVER_HEARTBEAT_MS));
      await flush();

      expect(result.current.sentCount).toBe(3);
      expect(socket.sent[2]).toMatchObject({ data: { latitude: north(0), speed: 0 } });
    } finally {
      jest.useRealTimers();
    }
  });
});
