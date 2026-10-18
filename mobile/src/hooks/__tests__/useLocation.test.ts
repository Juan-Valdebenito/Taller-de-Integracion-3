import { act, renderHook, waitFor } from '@testing-library/react-native';
import { AppState, Linking } from 'react-native';

import * as service from '../../location/locationService';
import { useLocation } from '../useLocation';

jest.mock('../../location/locationService', () => {
  const actual = jest.requireActual('../../location/locationService');
  return {
    ...actual,
    getLocationPermission: jest.fn(),
    requestLocationPermission: jest.fn(),
    getCurrentPosition: jest.fn(),
    watchPosition: jest.fn(),
  };
});

const mocked = jest.mocked(service);
const position = { latitude: -38.7359, longitude: -72.5904, accuracy: 10, timestamp: 1 };
let stopWatching: jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  mocked.getCurrentPosition.mockResolvedValue(position);
  stopWatching = jest.fn();
  mocked.watchPosition.mockResolvedValue(stopWatching);
});

/** Callback que el hook registró en watchPosition (simula una nueva lectura del GPS). */
const emitPosition = (next: service.UserPosition) => mocked.watchPosition.mock.calls.at(-1)![0](next);

describe('useLocation', () => {
  it('al montar solo consulta el permiso: no muestra el diálogo ni busca posición sin permiso', async () => {
    mocked.getLocationPermission.mockResolvedValue('undetermined');
    const { result } = await renderHook(() => useLocation());

    await waitFor(() => expect(result.current.permission).toBe('undetermined'));
    expect(mocked.requestLocationPermission).not.toHaveBeenCalled();
    expect(mocked.getCurrentPosition).not.toHaveBeenCalled();
    expect(result.current.position).toBeNull();
  });

  it('si el permiso ya estaba concedido, obtiene la posición al montar', async () => {
    mocked.getLocationPermission.mockResolvedValue('granted');
    const { result } = await renderHook(() => useLocation());

    await waitFor(() => expect(result.current.position).toEqual(position));
    expect(result.current.locating).toBe(false);
  });

  it('pide el permiso cuando el usuario lo decide y luego obtiene la posición', async () => {
    mocked.getLocationPermission.mockResolvedValue('undetermined');
    mocked.requestLocationPermission.mockResolvedValue('granted');
    const { result } = await renderHook(() => useLocation());
    await waitFor(() => expect(result.current.permission).toBe('undetermined'));

    await act(() => result.current.requestAndLocate());

    expect(result.current.permission).toBe('granted');
    expect(result.current.position).toEqual(position);
  });

  it('si el usuario rechaza, no busca la posición', async () => {
    mocked.getLocationPermission.mockResolvedValue('undetermined');
    mocked.requestLocationPermission.mockResolvedValue('denied');
    const { result } = await renderHook(() => useLocation());
    await waitFor(() => expect(result.current.permission).toBe('undetermined'));

    await act(() => result.current.requestAndLocate());

    expect(result.current.permission).toBe('denied');
    expect(mocked.getCurrentPosition).not.toHaveBeenCalled();
  });

  it('muestra el error si no se pudo obtener la posición', async () => {
    mocked.getLocationPermission.mockResolvedValue('granted');
    mocked.getCurrentPosition.mockRejectedValue(new service.LocationError('services-disabled'));
    const { result } = await renderHook(() => useLocation());

    await waitFor(() => expect(result.current.error).toContain('desactivada'));
    expect(result.current.position).toBeNull();
    expect(result.current.locating).toBe(false);
  });

  it('actualiza el permiso si fue revocado desde Ajustes', async () => {
    mocked.getLocationPermission.mockResolvedValueOnce('granted').mockResolvedValue('blocked');
    mocked.getCurrentPosition.mockRejectedValue(new service.LocationError('permission-denied'));
    const { result } = await renderHook(() => useLocation());

    await waitFor(() => expect(result.current.permission).toBe('blocked'));
  });

  describe('seguimiento de la posición', () => {
    it('sin permiso no sigue la posición', async () => {
      mocked.getLocationPermission.mockResolvedValue('denied');
      const { result } = await renderHook(() => useLocation());
      await waitFor(() => expect(result.current.permission).toBe('denied'));

      expect(mocked.watchPosition).not.toHaveBeenCalled();
    });

    it('con permiso actualiza la posición cuando el usuario se mueve', async () => {
      mocked.getLocationPermission.mockResolvedValue('granted');
      const { result } = await renderHook(() => useLocation());
      await waitFor(() => expect(mocked.watchPosition).toHaveBeenCalledTimes(1));

      const moved = { latitude: -38.7341, longitude: -72.6043, accuracy: 8, timestamp: 2 };
      await act(async () => emitPosition(moved));

      expect(result.current.position).toEqual(moved);
    });

    it('empieza a seguir la posición apenas el usuario concede el permiso', async () => {
      mocked.getLocationPermission.mockResolvedValue('undetermined');
      mocked.requestLocationPermission.mockResolvedValue('granted');
      const { result } = await renderHook(() => useLocation());
      await waitFor(() => expect(result.current.permission).toBe('undetermined'));
      expect(mocked.watchPosition).not.toHaveBeenCalled();

      await act(() => result.current.requestAndLocate());

      expect(mocked.watchPosition).toHaveBeenCalledTimes(1);
    });

    it('se pausa en segundo plano y se reanuda al volver a la app', async () => {
      const listeners: Array<(state: string) => void> = [];
      jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => {
        listeners.push(listener as (state: string) => void);
        return { remove: jest.fn() } as unknown as ReturnType<typeof AppState.addEventListener>;
      });
      mocked.getLocationPermission.mockResolvedValue('granted');
      await renderHook(() => useLocation());
      await waitFor(() => expect(mocked.watchPosition).toHaveBeenCalledTimes(1));

      await act(async () => listeners.forEach((listener) => listener('background')));
      expect(stopWatching).toHaveBeenCalledTimes(1);

      await act(async () => listeners.forEach((listener) => listener('active')));
      expect(mocked.watchPosition).toHaveBeenCalledTimes(2);
    });

    it('deja de seguir la posición al salir de la pantalla', async () => {
      mocked.getLocationPermission.mockResolvedValue('granted');
      const { unmount } = await renderHook(() => useLocation());
      await waitFor(() => expect(mocked.watchPosition).toHaveBeenCalledTimes(1));
      await waitFor(() => expect(stopWatching).not.toHaveBeenCalled());

      await unmount();

      expect(stopWatching).toHaveBeenCalledTimes(1);
    });
  });

  it('abre los ajustes del teléfono', async () => {
    mocked.getLocationPermission.mockResolvedValue('blocked');
    const openSettings = jest.spyOn(Linking, 'openSettings').mockResolvedValue();
    const { result } = await renderHook(() => useLocation());
    await waitFor(() => expect(result.current.permission).toBe('blocked'));

    await act(() => result.current.openSettings());
    expect(openSettings).toHaveBeenCalledTimes(1);
  });
});
