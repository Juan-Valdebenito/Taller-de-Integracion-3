import { act, renderHook, waitFor } from '@testing-library/react-native';

import { ApiError } from '../../api/client';
import * as stopsApi from '../../api/stopsApi';
import type { UserPosition } from '../../location/locationService';
import { REFETCH_DISTANCE_M, useNearestStop } from '../useNearestStop';

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
});
