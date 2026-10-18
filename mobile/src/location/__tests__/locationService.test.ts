import * as Location from 'expo-location';

import {
  LocationError,
  getCurrentPosition,
  getLocationPermission,
  requestLocationPermission,
  watchPosition,
} from '../locationService';

const mock = Location as unknown as typeof Location & {
  __permission: (status: 'granted' | 'undetermined' | 'denied', canAskAgain?: boolean) => unknown;
  __location: (lat: number, lng: number, accuracy?: number | null, timestamp?: number) => unknown;
};
const m = <T extends (...args: any[]) => any>(fn: T) => fn as unknown as jest.Mock;

// Plaza de Armas de Temuco
const TEMUCO = { latitude: -38.7359, longitude: -72.5904 };

beforeEach(() => {
  jest.clearAllMocks();
  m(Location.getForegroundPermissionsAsync).mockResolvedValue(mock.__permission('granted'));
  m(Location.hasServicesEnabledAsync).mockResolvedValue(true);
  m(Location.getCurrentPositionAsync).mockResolvedValue(mock.__location(TEMUCO.latitude, TEMUCO.longitude, 12));
  m(Location.getLastKnownPositionAsync).mockResolvedValue(null);
});

describe('permiso de ubicación', () => {
  it.each([
    ['granted', true, 'granted'],
    ['undetermined', true, 'undetermined'],
    ['denied', true, 'denied'],
    ['denied', false, 'blocked'],
  ] as const)('estado %s (canAskAgain=%s) → %s', async (status, canAskAgain, expected) => {
    m(Location.getForegroundPermissionsAsync).mockResolvedValue(mock.__permission(status, canAskAgain));
    await expect(getLocationPermission()).resolves.toBe(expected);
  });

  it('consultar el permiso no muestra el diálogo del sistema', async () => {
    await getLocationPermission();
    expect(Location.requestForegroundPermissionsAsync).not.toHaveBeenCalled();
  });

  it('pedir el permiso usa el diálogo de ubicación en primer plano (no en segundo plano)', async () => {
    m(Location.requestForegroundPermissionsAsync).mockResolvedValue(mock.__permission('granted'));
    await expect(requestLocationPermission()).resolves.toBe('granted');
    expect(Location.requestForegroundPermissionsAsync).toHaveBeenCalledTimes(1);
  });
});

describe('getCurrentPosition', () => {
  it('devuelve la posición actual con su precisión', async () => {
    await expect(getCurrentPosition()).resolves.toEqual({ ...TEMUCO, accuracy: 12, timestamp: 1_700_000_000_000 });
    expect(Location.getCurrentPositionAsync).toHaveBeenCalledWith({ accuracy: Location.Accuracy.Balanced });
  });

  it('falla con mensaje claro si no hay permiso', async () => {
    m(Location.getForegroundPermissionsAsync).mockResolvedValue(mock.__permission('denied'));
    await expect(getCurrentPosition()).rejects.toMatchObject({ code: 'permission-denied' });
    expect(Location.getCurrentPositionAsync).not.toHaveBeenCalled();
  });

  it('falla si la ubicación del teléfono está desactivada', async () => {
    m(Location.hasServicesEnabledAsync).mockResolvedValue(false);
    const error = await getCurrentPosition().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(LocationError);
    expect((error as LocationError).code).toBe('services-disabled');
    expect((error as LocationError).message).toContain('desactivada');
  });

  it('si el GPS no responde a tiempo usa una posición reciente guardada', async () => {
    m(Location.getCurrentPositionAsync).mockReturnValue(new Promise(() => {})); // nunca responde
    m(Location.getLastKnownPositionAsync).mockResolvedValue(mock.__location(-38.74, -72.6, 30));

    await expect(getCurrentPosition(10)).resolves.toMatchObject({ latitude: -38.74, longitude: -72.6, accuracy: 30 });
    expect(Location.getLastKnownPositionAsync).toHaveBeenCalledWith({ maxAge: 60_000 });
  });

  it('si el GPS no responde y no hay posición guardada, falla por tiempo', async () => {
    m(Location.getCurrentPositionAsync).mockReturnValue(new Promise(() => {}));
    await expect(getCurrentPosition(10)).rejects.toMatchObject({ code: 'timeout' });
  });

  it('si el GPS falla, también intenta con la posición guardada', async () => {
    m(Location.getCurrentPositionAsync).mockRejectedValue(new Error('Location unavailable'));
    m(Location.getLastKnownPositionAsync).mockResolvedValue(mock.__location(-38.7, -72.5));
    await expect(getCurrentPosition()).resolves.toMatchObject({ latitude: -38.7, longitude: -72.5 });
  });

  it('acepta precisión desconocida', async () => {
    m(Location.getCurrentPositionAsync).mockResolvedValue(mock.__location(TEMUCO.latitude, TEMUCO.longitude, null));
    await expect(getCurrentPosition()).resolves.toMatchObject({ accuracy: null });
  });
});

describe('watchPosition', () => {
  it('sigue la posición cada 20 m o 10 s y entrega posiciones normalizadas', async () => {
    const remove = jest.fn();
    m(Location.watchPositionAsync).mockResolvedValue({ remove });
    const onPosition = jest.fn();

    const stop = await watchPosition(onPosition);

    const [options, callback] = m(Location.watchPositionAsync).mock.calls[0];
    expect(options).toEqual({ accuracy: Location.Accuracy.Balanced, distanceInterval: 20, timeInterval: 10_000 });
    callback(mock.__location(TEMUCO.latitude, TEMUCO.longitude, 8, 123));
    expect(onPosition).toHaveBeenCalledWith({ ...TEMUCO, accuracy: 8, timestamp: 123 });

    stop();
    expect(remove).toHaveBeenCalledTimes(1);
  });

  it('informa los errores del seguimiento con un mensaje para el usuario', async () => {
    m(Location.watchPositionAsync).mockResolvedValue({ remove: jest.fn() });
    const onError = jest.fn();

    await watchPosition(jest.fn(), onError);
    m(Location.watchPositionAsync).mock.calls[0][2]('Location unavailable');

    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ code: 'unavailable' }));
  });
});
