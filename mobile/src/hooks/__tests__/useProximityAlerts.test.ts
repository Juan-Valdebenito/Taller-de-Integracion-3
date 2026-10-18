import { act, renderHook, waitFor } from '@testing-library/react-native';
import { Vibration } from 'react-native';

import * as busesApi from '../../api/busesApi';
import type { BusPosition } from '../../api/busesApi';
import type { ProximityResult, Stop } from '../../location/geo';
import { useProximityAlerts } from '../useProximityAlerts';

jest.mock('../../api/busesApi', () => ({ fetchActiveBuses: jest.fn() }));

const fetchActiveBuses = jest.mocked(busesApi.fetchActiveBuses);

const PLAZA: Stop = { id: 'p1', name: 'Plaza de Armas', latitude: -38.7359, longitude: -72.5904 };
const OTHER: Stop = { id: 'p2', name: 'Av. Alemania', latitude: -38.7341, longitude: -72.6043 };
const north = (stop: Stop, meters: number) => stop.latitude + meters / 111_195;
const bus = (id: string, stop: Stop, meters: number): BusPosition => ({
  id,
  patente: id.toUpperCase(),
  latitude: north(stop, meters),
  longitude: stop.longitude,
  speed: null,
  locationAt: Date.now(),
  routeId: null,
});
const proximity = (status: ProximityResult['status'], stop: Stop = PLAZA): ProximityResult => ({
  status,
  nearest: status === 'no-stops' ? null : { stop, distanceMeters: 40 },
  radiusMeters: 100,
});

let vibrate: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  vibrate = jest.spyOn(Vibration, 'vibrate').mockImplementation(() => {});
  fetchActiveBuses.mockResolvedValue([]);
});

afterEach(() => {
  jest.useRealTimers();
});

describe('useProximityAlerts', () => {
  it.each(['outside', 'low-accuracy', 'no-stops'] as const)(
    '%s: no consulta micros ni emite alertas (en pausa)',
    async (status) => {
      fetchActiveBuses.mockResolvedValue([bus('b1', PLAZA, 50)]);
      const { result } = await renderHook(() => useProximityAlerts(proximity(status)));

      expect(result.current.enabled).toBe(false);
      expect(result.current.pausedReason).toBeTruthy();
      expect(fetchActiveBuses).not.toHaveBeenCalled();
      expect(result.current.alert).toBeNull();
      expect(vibrate).not.toHaveBeenCalled();
    },
  );

  it('sin verificación de ubicación tampoco consulta', async () => {
    const { result } = await renderHook(() => useProximityAlerts(null));
    expect(result.current.enabled).toBe(false);
    expect(fetchActiveBuses).not.toHaveBeenCalled();
  });

  it('dentro del radio: alerta la micro que se acerca al paradero y vibra', async () => {
    fetchActiveBuses.mockResolvedValue([bus('b1', PLAZA, 350), bus('lejos', PLAZA, 2000)]);
    const { result } = await renderHook(() => useProximityAlerts(proximity('inside')));

    await waitFor(() => expect(result.current.alert).not.toBeNull());
    expect(result.current.enabled).toBe(true);
    expect(result.current.stop).toBe(PLAZA);
    expect(result.current.alert?.message).toBe('La micro B1 está a 350 m de Plaza de Armas.');
    expect(result.current.approaching.map((a) => a.bus.id)).toEqual(['b1']);
    expect(vibrate).toHaveBeenCalledTimes(1);
  });

  it('consulta periódicamente y no repite la alerta de la misma micro', async () => {
    jest.useFakeTimers();
    fetchActiveBuses.mockResolvedValue([bus('b1', PLAZA, 300)]);
    const { result } = await renderHook(() => useProximityAlerts(proximity('inside')));
    await waitFor(() => expect(result.current.alert).not.toBeNull());

    await act(async () => {
      result.current.dismissAlert();
    });
    await act(async () => {
      jest.advanceTimersByTime(15_000);
    });

    expect(fetchActiveBuses).toHaveBeenCalledTimes(2);
    expect(result.current.alert).toBeNull();
    expect(vibrate).toHaveBeenCalledTimes(1);
  });

  it('una micro nueva que entra al radio genera otra alerta', async () => {
    fetchActiveBuses.mockResolvedValueOnce([bus('b1', PLAZA, 300)]);
    const { result } = await renderHook(() => useProximityAlerts(proximity('inside')));
    await waitFor(() => expect(result.current.alert?.bus.id).toBe('b1'));

    fetchActiveBuses.mockResolvedValueOnce([bus('b1', PLAZA, 200), bus('b2', PLAZA, 450)]);
    await act(async () => {
      await result.current.checkNow();
    });

    expect(result.current.alert?.bus.id).toBe('b2');
    expect(vibrate).toHaveBeenCalledTimes(2);
  });

  it('si el usuario sale del radio del paradero, las alertas se pausan y se limpian', async () => {
    jest.useFakeTimers();
    fetchActiveBuses.mockResolvedValue([bus('b1', PLAZA, 300)]);
    const { result, rerender } = await renderHook(({ value }: { value: ProximityResult }) => useProximityAlerts(value), {
      initialProps: { value: proximity('inside') },
    });
    await waitFor(() => expect(result.current.alert).not.toBeNull());

    await rerender({ value: proximity('outside') });
    await act(async () => {
      jest.advanceTimersByTime(60_000);
    });

    expect(result.current.enabled).toBe(false);
    expect(result.current.alert).toBeNull();
    expect(result.current.approaching).toEqual([]);
    expect(fetchActiveBuses).toHaveBeenCalledTimes(1);
  });

  it('al cambiar de paradero vigila el nuevo y vuelve a alertar', async () => {
    fetchActiveBuses.mockResolvedValue([bus('b1', PLAZA, 300), bus('b9', OTHER, 100)]);
    const { result, rerender } = await renderHook(({ value }: { value: ProximityResult }) => useProximityAlerts(value), {
      initialProps: { value: proximity('inside', PLAZA) },
    });
    await waitFor(() => expect(result.current.alert?.bus.id).toBe('b1'));

    await rerender({ value: proximity('inside', OTHER) });

    await waitFor(() => expect(result.current.alert?.bus.id).toBe('b9'));
    expect(result.current.alert?.stop).toBe(OTHER);
  });

  it('error al consultar las micros', async () => {
    fetchActiveBuses.mockRejectedValue(new Error('network'));
    const { result } = await renderHook(() => useProximityAlerts(proximity('inside')));

    await waitFor(() => expect(result.current.error).toBe('No se pudieron consultar las micros cercanas.'));
    expect(result.current.alert).toBeNull();
  });
});
