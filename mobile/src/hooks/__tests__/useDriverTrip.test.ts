import { act, renderHook } from '@testing-library/react-native';

import * as companyApi from '../../api/companyApi';
import type { CompanyBus, CompanyRoute } from '../../api/companyApi';
import { ApiError } from '../../api/errors';
import { useCompanyOperations } from '../useCompanyOperations';
import { useDriverTrip } from '../useDriverTrip';

jest.mock('../useCompanyOperations', () => ({ useCompanyOperations: jest.fn() }));
jest.mock('../../api/companyApi', () => ({ updateCompanyBus: jest.fn() }));

const updateCompanyBus = jest.mocked(companyApi.updateCompanyBus);
const buses: CompanyBus[] = [
  { id: 'm', patente: 'FGRT33', capacity: 35, currentPassengers: 0, status: 'MAINTENANCE', companyId: 'co1', routeId: null },
  { id: 'd', patente: 'BGPK45', capacity: 35, currentPassengers: 14, status: 'INACTIVE', companyId: 'co1', routeId: null },
  { id: 'e', patente: 'DKSL90', capacity: 35, currentPassengers: 8, status: 'INACTIVE', companyId: 'co1', routeId: null },
];
const routes: CompanyRoute[] = [
  { id: 'r1', code: '7A', name: 'Cajón / Santa Rosa', isActive: true, companyId: 'co1' },
  { id: 'r2', code: '1C', name: 'Labranza / Centro', isActive: true, companyId: 'co1' },
  { id: 'off', code: '9Z', name: 'Antigua', isActive: false, companyId: 'co1' },
];
const refresh = jest.fn().mockResolvedValue(undefined);

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(useCompanyOperations).mockReturnValue({ buses, routes, loading: false, error: null, refresh });
  updateCompanyBus.mockImplementation(async (id, changes) => ({ ...buses.find((b) => b.id === id)!, ...changes }) as CompanyBus);
});

describe('useDriverTrip', () => {
  it('ofrece todas las micros, solo rutas activas, y elige por defecto la primera disponible', async () => {
    const { result } = await renderHook(() => useDriverTrip());

    expect(result.current.buses.map((b) => b.id)).toEqual(['m', 'd', 'e']);
    expect(result.current.routes.map((r) => r.id)).toEqual(['r1', 'r2']);
    expect(result.current.selectedBus?.id).toBe('d');
    expect(result.current.selectedRoute?.id).toBe('r1');
    expect(result.current.trip).toBeNull();
  });

  it('iniciar pone la micro ACTIVE con la ruta elegida y guarda el recorrido', async () => {
    const { result } = await renderHook(() => useDriverTrip(() => 1_000));
    await act(async () => {
      result.current.selectBus('e');
      result.current.selectRoute('r2');
    });

    await act(() => result.current.start());

    expect(updateCompanyBus).toHaveBeenCalledWith('e', { status: 'ACTIVE', routeId: 'r2' });
    expect(result.current.trip).toMatchObject({ bus: { id: 'e', status: 'ACTIVE', routeId: 'r2' }, route: { id: 'r2' }, startedAt: 1_000 });
    expect(refresh).toHaveBeenCalled();
  });

  it('finalizar deja la micro INACTIVE y termina el recorrido', async () => {
    const { result } = await renderHook(() => useDriverTrip());
    await act(() => result.current.start());

    await act(() => result.current.stop());

    expect(updateCompanyBus).toHaveBeenLastCalledWith('d', { status: 'INACTIVE' });
    expect(result.current.trip).toBeNull();
  });

  it('si el backend falla muestra el motivo y no inicia', async () => {
    updateCompanyBus.mockRejectedValueOnce(new ApiError(403, 'No tienes permiso para realizar esta acción.'));
    const { result } = await renderHook(() => useDriverTrip());

    await act(() => result.current.start());

    expect(result.current.trip).toBeNull();
    expect(result.current.actionError).toBe('No se pudo iniciar el recorrido: No tienes permiso para realizar esta acción.');
    expect(result.current.busy).toBe(false);
  });

  it('un doble toque envía una sola solicitud', async () => {
    let resolve!: () => void;
    updateCompanyBus.mockImplementationOnce(
      () => new Promise((r) => (resolve = () => r({ ...buses[1], status: 'ACTIVE' }))),
    );
    const { result } = await renderHook(() => useDriverTrip());

    let first!: Promise<void>;
    await act(async () => {
      first = result.current.start();
      void result.current.start();
    });
    expect(result.current.busy).toBe(true);
    await act(async () => {
      resolve();
      await first;
    });

    expect(updateCompanyBus).toHaveBeenCalledTimes(1);
  });

  it('sin micros que puedan salir no hay micro elegida', async () => {
    jest.mocked(useCompanyOperations).mockReturnValue({ buses: [buses[0]], routes, loading: false, error: null, refresh });
    const { result } = await renderHook(() => useDriverTrip());

    expect(result.current.selectedBus).toBeNull();
    await act(() => result.current.start());
    expect(updateCompanyBus).not.toHaveBeenCalled();
  });
});
