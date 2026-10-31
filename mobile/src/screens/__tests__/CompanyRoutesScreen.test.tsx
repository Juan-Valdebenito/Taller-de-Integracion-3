import { fireEvent, render, screen } from '@testing-library/react-native';

import * as companyApi from '../../api/companyApi';
import type { CompanyBus, CompanyRoute, RouteStop } from '../../api/companyApi';
import { ApiError } from '../../api/errors';
import { useCompanyOperations } from '../../hooks/useCompanyOperations';
import { CompanyRoutesScreen, routeBusesLabel } from '../CompanyRoutesScreen';

jest.mock('../../hooks/useCompanyOperations', () => ({ useCompanyOperations: jest.fn() }));
jest.mock('../../api/companyApi', () => ({ fetchRouteStops: jest.fn() }));

const fetchRouteStops = jest.mocked(companyApi.fetchRouteStops);

const routes: CompanyRoute[] = [
  { id: 'r1', name: 'Centro - Campus', code: '7A', description: 'Pasa por la Plaza de Armas', isActive: true, companyId: 'co1' },
  { id: 'r2', name: 'Labranza', code: '1C', isActive: false, companyId: 'co1' },
];
const buses: CompanyBus[] = [
  { id: 'a', patente: 'AAAA11', capacity: 80, currentPassengers: 10, status: 'ACTIVE', companyId: 'co1', routeId: 'r1' },
  { id: 'b', patente: 'BBBB22', capacity: 80, currentPassengers: 0, status: 'INACTIVE', companyId: 'co1', routeId: 'r1' },
];
const stops: RouteStop[] = [
  { id: 's1', name: 'Terminal Campus', latitude: -38.7, longitude: -72.55, order: 1 },
  { id: 's2', name: 'Plaza de Armas', latitude: -38.73, longitude: -72.59, order: 2 },
];

function mockOperations(overrides: Partial<ReturnType<typeof useCompanyOperations>> = {}) {
  jest.mocked(useCompanyOperations).mockReturnValue({ routes, buses, loading: false, error: null, refresh: jest.fn(), ...overrides });
}

beforeEach(() => {
  jest.clearAllMocks();
  fetchRouteStops.mockResolvedValue(stops);
});

describe('routeBusesLabel', () => {
  it('cuenta las micros asignadas y las que están en ruta', () => {
    expect(routeBusesLabel(routes[0], buses)).toBe('2 micros asignadas · 1 en ruta');
    expect(routeBusesLabel(routes[0], [buses[0]])).toBe('1 micro asignada · 1 en ruta');
    expect(routeBusesLabel(routes[1], buses)).toBe('Sin micros asignadas');
  });
});

describe('CompanyRoutesScreen', () => {
  it('muestra el encabezado y una tarjeta por ruta con estado y micros', async () => {
    mockOperations();
    await render(<CompanyRoutesScreen />);

    expect(screen.getByRole('header', { name: 'Rutas' })).toBeTruthy();
    expect(screen.getByText('Centro - Campus')).toBeTruthy();
    expect(screen.getByText('Pasa por la Plaza de Armas')).toBeTruthy();
    expect(screen.getByText('Activa')).toBeTruthy();
    expect(screen.getByText('Inactiva')).toBeTruthy();
    expect(screen.getByText('🚍 2 micros asignadas · 1 en ruta')).toBeTruthy();
    // Los paraderos se piden recién al abrir una ruta.
    expect(fetchRouteStops).not.toHaveBeenCalled();
  });

  it('al tocar una ruta muestra sus paraderos en orden, y al tocarla de nuevo los oculta', async () => {
    mockOperations();
    await render(<CompanyRoutesScreen />);
    const card = () => screen.getByRole('button', { name: '7A Centro - Campus, activa' });

    await fireEvent.press(card());

    expect(await screen.findByText('Terminal Campus')).toBeTruthy();
    expect(fetchRouteStops).toHaveBeenCalledWith('r1');
    expect(screen.getByText('2 paraderos')).toBeTruthy();
    expect(screen.getByText('1')).toBeTruthy();
    expect(screen.getByText('Plaza de Armas')).toBeTruthy();
    expect(card().props.accessibilityState).toMatchObject({ expanded: true });

    await fireEvent.press(card());
    expect(screen.queryByText('Terminal Campus')).toBeNull();
  });

  it('una ruta sin paraderos lo dice', async () => {
    mockOperations();
    fetchRouteStops.mockResolvedValue([]);
    await render(<CompanyRoutesScreen />);

    await fireEvent.press(screen.getByRole('button', { name: '1C Labranza, inactiva' }));

    expect(await screen.findByText('Esta ruta no tiene paraderos registrados.')).toBeTruthy();
  });

  it('si fallan los paraderos se puede reintentar', async () => {
    mockOperations();
    fetchRouteStops.mockRejectedValueOnce(new ApiError(500, 'Error al obtener paradas'));
    await render(<CompanyRoutesScreen />);

    await fireEvent.press(screen.getByRole('button', { name: '7A Centro - Campus, activa' }));
    expect(await screen.findByText('Error al obtener paradas')).toBeTruthy();

    await fireEvent.press(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText('Terminal Campus')).toBeTruthy();
  });

  it('sin rutas lo indica, y un error de carga se muestra', async () => {
    mockOperations({ routes: [] });
    const { rerender } = await render(<CompanyRoutesScreen />);
    expect(screen.getByText('No hay rutas registradas para esta empresa.')).toBeTruthy();

    mockOperations({ routes: [], error: 'No se pudo cargar la información de la empresa.' });
    await rerender(<CompanyRoutesScreen />);
    expect(screen.getByText('No se pudo cargar la información de la empresa.')).toBeTruthy();
    expect(screen.queryByText('No hay rutas registradas para esta empresa.')).toBeNull();
  });
});
