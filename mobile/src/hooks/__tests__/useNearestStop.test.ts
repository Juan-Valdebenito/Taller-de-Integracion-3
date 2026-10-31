import { act, renderHook, waitFor } from '@testing-library/react-native';

import { ApiError } from '../../api/errors';
import * as stopsApi from '../../api/stopsApi';
import type { UserPosition } from '../../location/locationService';
import { REFETCH_DISTANCE_M, RETRY_BASE_DELAY_MS, retryDelay, useNearestStop } from '../useNearestStop';

jest.mock('../../api/stopsApi', () => ({ fetchNearbyStops: jest.fn() }));

const fetchNearbyStops = jest.mocked(stopsApi.fetchNearbyStops);

// Plaza de Armas de Temuco; 1 m de latitud ≈ 1/111 195 grados.
const PLAZA = { latitude: -38.7359, longitude: -72.5904 };
const north = (meters: number) => PLAZA.latitude + meters / 111_195;
const at = (metersNorth: number, accuracy: number | null = 10): UserPosition => ({
  latitude: north(metersNorth),
  longitude: PLAZA.longitude,
  accuracy,
  timestamp: 1,
});
const stops = [{ id: 'p1', name: 'Plaza de Armas', latitude: north(60), longitude: PLAZA.longitude }];

beforeEach(() => {
  jest.clearAllMocks();
  fetchNearbyStops.mockResolvedValue(stops);
});

afterEach(() => {
  jest.useRealTimers();
});

describe('useNearestStop', () => {
  it('sin posición no consulta al backend', async () => {
    const { result } = await renderHook(() => useNearestStop(null));
    expect(fetchNearbyStops).not.toHaveBeenCalled();
    expect(result.current.proximity).toBeNull();
  });

  it('con posición consulta los paraderos en el radio de búsqueda y verifica la cercanía', async () => {
    const { result } = await renderHook(() => useNearestStop(at(0)));

    await waitFor(() => expect(result.current.proximity?.status).toBe('inside'));
    expect(fetchNearbyStops).toHaveBeenCalledWith(expect.objectContaining({ ...PLAZA, radiusMeters: 1000 }));
    expect(result.current.proximity?.nearest?.stop.id).toBe('p1');
    expect(result.current.proximity?.radiusMeters).toBe(100);
    expect(result.current.loading).toBe(false);
  });

  it('recalcula con cada posición sin volver a consultar si el usuario se movió poco', async () => {
    const { result, rerender } = await renderHook(({ position }: { position: UserPosition }) => useNearestStop(position), {
      initialProps: { position: at(0) },
    });
    await waitFor(() => expect(result.current.proximity?.status).toBe('inside'));

    // Se aleja 150 m al sur: el paradero queda a ~210 m, fuera del radio de 100 m.
    await rerender({ position: at(-150) });

    expect(result.current.proximity?.status).toBe('outside');
    expect(result.current.proximity?.nearest?.distanceMeters).toBeCloseTo(210, 0);
    expect(fetchNearbyStops).toHaveBeenCalledTimes(1);
  });

  it('vuelve a consultar cuando el usuario se aleja del punto de consulta', async () => {
    const { result, rerender } = await renderHook(({ position }: { position: UserPosition }) => useNearestStop(position), {
      initialProps: { position: at(0) },
    });
    await waitFor(() => expect(result.current.proximity).not.toBeNull());

    await rerender({ position: at(REFETCH_DISTANCE_M + 50) });

    await waitFor(() => expect(fetchNearbyStops).toHaveBeenCalledTimes(2));
  });

  it('no confirma la cercanía con GPS impreciso', async () => {
    const { result } = await renderHook(() => useNearestStop(at(0, 400)));
    await waitFor(() => expect(result.current.proximity?.status).toBe('low-accuracy'));
  });

  it('sin paraderos en la zona', async () => {
    fetchNearbyStops.mockResolvedValue([]);
    const { result } = await renderHook(() => useNearestStop(at(0)));
    await waitFor(() => expect(result.current.proximity?.status).toBe('no-stops'));
  });

  it('informa el error del backend y permite reintentar', async () => {
    fetchNearbyStops.mockRejectedValueOnce(new ApiError(503, 'micro service unavailable'));
    const { result } = await renderHook(() => useNearestStop(at(0)));

    await waitFor(() => expect(result.current.error).toBe('El servicio de paraderos no está disponible. Intenta más tarde.'));
    expect(result.current.proximity).toBeNull();

    await act(async () => {
      await result.current.reload();
    });

    expect(result.current.error).toBeNull();
    expect(result.current.proximity?.status).toBe('inside');
  });

  it('ignora una respuesta antigua que llega después de una más nueva', async () => {
    let resolveFirst: (value: typeof stops) => void = () => {};
    fetchNearbyStops.mockImplementationOnce(() => new Promise((resolve) => (resolveFirst = resolve)));
    const farStops = [{ id: 'lejos', name: 'Lejos', latitude: north(5000), longitude: PLAZA.longitude }];
    fetchNearbyStops.mockResolvedValueOnce(farStops);

    const { result } = await renderHook(() => useNearestStop(at(0)));
    await act(async () => {
      await result.current.reload();
    });
    expect(result.current.proximity?.nearest?.stop.id).toBe('lejos');

    await act(async () => {
      resolveFirst(stops);
    });
    expect(result.current.proximity?.nearest?.stop.id).toBe('lejos');
  });
  describe('reintentos tras un error', () => {
    const unavailable = () => new ApiError(503, 'micro service unavailable');

    it('no reintenta con cada nueva posición: espera y reintenta solo una vez', async () => {
      jest.useFakeTimers();
      fetchNearbyStops.mockRejectedValueOnce(unavailable());
      const { result, rerender } = await renderHook(({ position }: { position: UserPosition }) => useNearestStop(position), {
        initialProps: { position: at(0) },
      });
      await waitFor(() => expect(result.current.error).not.toBeNull());

      // El GPS sigue entregando posiciones (incluso lejanas) durante la espera.
      for (const meters of [10, 20, 500, 900]) {
        await rerender({ position: at(meters) });
      }
      expect(fetchNearbyStops).toHaveBeenCalledTimes(1);

      await act(async () => {
        jest.advanceTimersByTime(RETRY_BASE_DELAY_MS);
      });

      expect(fetchNearbyStops).toHaveBeenCalledTimes(2);
      // Reintenta desde la última posición conocida.
      expect(fetchNearbyStops).toHaveBeenLastCalledWith(expect.objectContaining({ latitude: north(900) }));
      await waitFor(() => expect(result.current.error).toBeNull());
      expect(result.current.proximity).not.toBeNull();
    });

    it('si vuelve a fallar, duplica la espera', async () => {
      jest.useFakeTimers();
      fetchNearbyStops.mockRejectedValueOnce(unavailable()).mockRejectedValueOnce(unavailable());
      const { result } = await renderHook(() => useNearestStop(at(0)));
      await waitFor(() => expect(result.current.error).not.toBeNull());

      await act(async () => {
        jest.advanceTimersByTime(RETRY_BASE_DELAY_MS);
      });
      expect(fetchNearbyStops).toHaveBeenCalledTimes(2);

      await act(async () => {
        jest.advanceTimersByTime(RETRY_BASE_DELAY_MS);
      });
      expect(fetchNearbyStops).toHaveBeenCalledTimes(2);

      await act(async () => {
        jest.advanceTimersByTime(RETRY_BASE_DELAY_MS);
      });
      expect(fetchNearbyStops).toHaveBeenCalledTimes(3);
    });

    it('el botón Reintentar consulta al instante y cancela el reintento programado', async () => {
      jest.useFakeTimers();
      fetchNearbyStops.mockRejectedValueOnce(unavailable());
      const { result } = await renderHook(() => useNearestStop(at(0)));
      await waitFor(() => expect(result.current.error).not.toBeNull());

      await act(async () => {
        await result.current.reload();
      });
      expect(fetchNearbyStops).toHaveBeenCalledTimes(2);
      expect(result.current.error).toBeNull();

      await act(async () => {
        jest.advanceTimersByTime(RETRY_BASE_DELAY_MS * 10);
      });
      expect(fetchNearbyStops).toHaveBeenCalledTimes(2);
    });

    it('al salir de la pantalla cancela el reintento pendiente', async () => {
      jest.useFakeTimers();
      fetchNearbyStops.mockRejectedValueOnce(unavailable());
      const { result, unmount } = await renderHook(() => useNearestStop(at(0)));
      await waitFor(() => expect(result.current.error).not.toBeNull());

      await unmount();
      await act(async () => {
        jest.advanceTimersByTime(RETRY_BASE_DELAY_MS * 10);
      });

      expect(fetchNearbyStops).toHaveBeenCalledTimes(1);
    });

    it.each([
      [1, 30_000],
      [2, 60_000],
      [3, 120_000],
      [4, 240_000],
      [5, 300_000],
      [10, 300_000],
    ])('retryDelay(%p fallos) = %p ms', (failures, expected) => {
      expect(retryDelay(failures)).toBe(expected);
    });
  });
});
