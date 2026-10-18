import { act, renderHook, waitFor } from '@testing-library/react-native';
import { Linking } from 'react-native';

import * as service from '../../location/locationService';
import { useLocation } from '../useLocation';

jest.mock('../../location/locationService', () => {
  const actual = jest.requireActual('../../location/locationService');
  return {
    ...actual,
    getLocationPermission: jest.fn(),
    requestLocationPermission: jest.fn(),
    getCurrentPosition: jest.fn(),
  };
});

const mocked = jest.mocked(service);
const position = { latitude: -38.7359, longitude: -72.5904, accuracy: 10, timestamp: 1 };

beforeEach(() => {
  jest.clearAllMocks();
  mocked.getCurrentPosition.mockResolvedValue(position);
});

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

  it('abre los ajustes del teléfono', async () => {
    mocked.getLocationPermission.mockResolvedValue('blocked');
    const openSettings = jest.spyOn(Linking, 'openSettings').mockResolvedValue();
    const { result } = await renderHook(() => useLocation());
    await waitFor(() => expect(result.current.permission).toBe('blocked'));

    await act(() => result.current.openSettings());
    expect(openSettings).toHaveBeenCalledTimes(1);
  });
});
