import { fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react-native';

import * as adminApi from '../../api/adminApi';
import * as companyApi from '../../api/companyApi';
import { ApiError } from '../../api/errors';
import { useAdminRoutes } from '../../hooks/useAdminRoutes';
import { AdminRoutesScreen } from '../AdminRoutesScreen';

jest.mock('../../api/adminApi', () => ({ fetchCompanies: jest.fn() }));
jest.mock('../../api/companyApi', () => ({ fetchCompanyRoutes: jest.fn(), fetchCompanyBuses: jest.fn(), fetchRouteStops: jest.fn() }));

const admin = jest.mocked(adminApi);
const company = jest.mocked(companyApi);

beforeEach(() => {
  jest.clearAllMocks();
  company.fetchCompanyRoutes.mockResolvedValue([
    { id: 'r1', code: '7A', name: 'Cajón / Santa Rosa', description: 'Pasa por el centro', isActive: true, companyId: 'co1' },
    { id: 'r2', code: '1C', name: 'Labranza / Centro', description: null, isActive: false, companyId: 'co2' },
  ]);
  company.fetchCompanyBuses.mockResolvedValue([
    { id: 'b1', patente: 'DEMO-01', capacity: 40, currentPassengers: 0, status: 'ACTIVE', companyId: 'co1', routeId: 'r1' },
  ]);
  admin.fetchCompanies.mockResolvedValue([
    { id: 'co1', name: 'Buses Ñielol', rut: '', email: '', phone: null, address: null, isActive: true },
    { id: 'co2', name: 'Trans Sur', rut: '', email: '', phone: null, address: null, isActive: true },
  ]);
  company.fetchRouteStops.mockResolvedValue([
    { id: 's1', name: 'Terminal Campus', latitude: -38.70396, longitude: -72.55051, order: 1 },
    { id: 's2', name: 'Plaza de Armas', latitude: -38.7359, longitude: -72.5904, order: 2 },
    { id: 's3', name: 'Portal Temuco', latitude: -38.7345, longitude: -72.6118, order: 3 },
  ]);
});

describe('useAdminRoutes', () => {
  it('si fallan las empresas o las micros, igual muestra las rutas', async () => {
    admin.fetchCompanies.mockRejectedValue(new Error('caído'));
    company.fetchCompanyBuses.mockRejectedValue(new Error('caído'));
    const { result } = await renderHook(() => useAdminRoutes());

    await waitFor(() => expect(result.current.routes).toHaveLength(2));
    expect(result.current.routes[0]).toMatchObject({ companyName: 'co1', buses: [] });
    expect(result.current.error).toBeNull();
  });

  it('si fallan las rutas muestra el error', async () => {
    company.fetchCompanyRoutes.mockRejectedValue(new ApiError(500, 'Error al obtener rutas'));
    const { result } = await renderHook(() => useAdminRoutes());
    await waitFor(() => expect(result.current.error).toBe('Error al obtener rutas'));
  });
});

describe('AdminRoutesScreen', () => {
  it('muestra el encabezado del web y una tarjeta por ruta', async () => {
    await render(<AdminRoutesScreen />);

    expect(screen.getByRole('header', { name: 'Rutas del Sistema' })).toBeTruthy();
    expect(await screen.findByText('1 rutas activas · paraderos bajo demanda')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Ruta 7A Cajón / Santa Rosa, Buses Ñielol, activa' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Ruta 1C Labranza / Centro, Trans Sur, inactiva' })).toBeTruthy();
    expect(screen.getByText('Sin descripción')).toBeTruthy();
    // Paraderos aún no cargados: "—" en vez de un 0 engañoso.
    expect(screen.getAllByText('—')).toHaveLength(2);
    expect(company.fetchRouteStops).not.toHaveBeenCalled();
  });

  it('al tocar una ruta muestra su recorrido de paraderos y sus micros, y actualiza los conteos', async () => {
    await render(<AdminRoutesScreen />);
    await fireEvent.press(await screen.findByRole('button', { name: /^Ruta 7A/ }));

    expect(await screen.findByText('Terminal Campus')).toBeTruthy();
    expect(company.fetchRouteStops).toHaveBeenCalledWith('r1');
    expect(screen.getByText('-38.7040, -72.5505')).toBeTruthy();
    expect(screen.getByText('Portal Temuco')).toBeTruthy();
    expect(screen.getByLabelText('Micro DEMO-01, en servicio')).toBeTruthy();
    expect(await screen.findByText('1 rutas activas · 3 paraderos cargados')).toBeTruthy();
  });

  it('una ruta sin micros ni paraderos lo dice', async () => {
    company.fetchRouteStops.mockResolvedValue([]);
    await render(<AdminRoutesScreen />);
    await fireEvent.press(await screen.findByRole('button', { name: /^Ruta 1C/ }));

    expect(await screen.findByText('Esta ruta no tiene paraderos registrados.')).toBeTruthy();
    expect(screen.getByText('Ninguna micro asignada a esta ruta.')).toBeTruthy();
  });

  it('busca y filtra por empresa y estado', async () => {
    await render(<AdminRoutesScreen />);
    await screen.findByRole('button', { name: /^Ruta 7A/ });

    await fireEvent.changeText(screen.getByLabelText('Buscar ruta'), 'labranza');
    expect(screen.queryByRole('button', { name: /^Ruta 7A/ })).toBeNull();
    await fireEvent.changeText(screen.getByLabelText('Buscar ruta'), '');

    await fireEvent.press(screen.getByRole('button', { name: 'Empresa: Todas las empresas' }));
    await fireEvent.press(screen.getByRole('radio', { name: 'Buses Ñielol' }));
    expect(screen.queryByRole('button', { name: /^Ruta 1C/ })).toBeNull();

    await fireEvent.press(screen.getByRole('button', { name: 'Estado: Todos los estados' }));
    await fireEvent.press(screen.getByRole('radio', { name: 'Inactivas' }));
    expect(screen.getByText('No se encontraron rutas')).toBeTruthy();
  });
});
