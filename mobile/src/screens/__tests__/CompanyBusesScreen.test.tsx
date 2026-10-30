import { fireEvent, render, screen } from '@testing-library/react-native';

import type { CompanyBus, CompanyRoute } from '../../api/companyApi';
import { useCompanyOperations } from '../../hooks/useCompanyOperations';
import { CompanyBusesScreen } from '../CompanyBusesScreen';

jest.mock('../../hooks/useCompanyOperations', () => ({ useCompanyOperations: jest.fn() }));

const routes: CompanyRoute[] = [{ id: 'r7a', code: '7A', name: 'Cajón / Sta Rosa', isActive: true, companyId: 'co1' }];
const buses: CompanyBus[] = [
  { id: 'b1', patente: 'BGPK-45', capacity: 35, currentPassengers: 14, status: 'ACTIVE', companyId: 'co1', routeId: 'r7a' },
  { id: 'b2', patente: 'FGRT-33', capacity: 40, currentPassengers: 0, status: 'MAINTENANCE', companyId: 'co1', routeId: null },
];

function mockOperations(overrides: Partial<ReturnType<typeof useCompanyOperations>> = {}) {
  const value = { buses, routes, loading: false, error: null, refresh: jest.fn().mockResolvedValue(undefined), ...overrides };
  jest.mocked(useCompanyOperations).mockReturnValue(value);
  return value;
}

beforeEach(() => jest.clearAllMocks());

describe('CompanyBusesScreen', () => {
  it('muestra el encabezado y las 5 cifras del web', async () => {
    mockOperations();
    await render(<CompanyBusesScreen />);

    expect(screen.getByRole('header', { name: 'Gestión de Flota de Micros' })).toBeTruthy();
    expect(screen.getByLabelText('Flota Total: 2')).toBeTruthy();
    expect(screen.getByLabelText('En Servicio: 1')).toBeTruthy();
    expect(screen.getByLabelText('En Taller: 1')).toBeTruthy();
    expect(screen.getByLabelText('En Reserva / Parada: 0')).toBeTruthy();
    expect(screen.getByLabelText('Aforo Promedio: 40%')).toBeTruthy();
  });

  it('una tarjeta por micro con línea, capacidad, ocupación y estado', async () => {
    mockOperations();
    await render(<CompanyBusesScreen />);

    expect(screen.getByText('Listado de Vehículos (2)')).toBeTruthy();
    expect(screen.getByLabelText('Micro BGPK-45, Línea 7A, en servicio, 40% de aforo')).toBeTruthy();
    expect(screen.getByLabelText('Micro FGRT-33, sin ruta asignada, en taller, 0% de aforo')).toBeTruthy();
  });

  it('filtra por patente y por estado, y avisa si no hay resultados', async () => {
    mockOperations();
    await render(<CompanyBusesScreen />);

    await fireEvent.changeText(screen.getByLabelText('Buscar Micro'), 'fgrt');
    expect(screen.getByText('Listado de Vehículos (1)')).toBeTruthy();
    expect(screen.queryByLabelText(/Micro BGPK-45/)).toBeNull();

    await fireEvent.changeText(screen.getByLabelText('Buscar Micro'), '');
    await fireEvent.press(screen.getByRole('button', { name: 'Estado Operacional: Todos los estados' }));
    await fireEvent.press(screen.getByRole('radio', { name: 'Inactiva' }));
    expect(screen.getByText('No se encontraron micros con los criterios seleccionados.')).toBeTruthy();
  });

  it('filtra por línea, incluida "Sin ruta asignada"', async () => {
    mockOperations();
    await render(<CompanyBusesScreen />);

    await fireEvent.press(screen.getByRole('button', { name: 'Línea Asignada: Todas las líneas' }));
    await fireEvent.press(screen.getByRole('radio', { name: 'Sin ruta asignada' }));

    expect(screen.getByText('Listado de Vehículos (1)')).toBeTruthy();
    expect(screen.getByLabelText(/Micro FGRT-33/)).toBeTruthy();
  });

  it('"Sincronizar" vuelve a pedir la flota', async () => {
    const operations = mockOperations();
    await render(<CompanyBusesScreen />);

    await fireEvent.press(screen.getByRole('button', { name: 'Sincronizar' }));
    expect(operations.refresh).toHaveBeenCalled();
  });

  it('nunca inventa micros: sin datos muestra el error o que no hay micros', async () => {
    mockOperations({ buses: [], error: 'No se pudo cargar la información de la empresa.' });
    const { rerender } = await render(<CompanyBusesScreen />);
    expect(screen.getByText('No se pudo cargar la información de la empresa.')).toBeTruthy();
    expect(screen.getByLabelText('Flota Total: 0')).toBeTruthy();

    mockOperations({ buses: [] });
    await rerender(<CompanyBusesScreen />);
    expect(screen.getByText('No hay micros registradas para esta empresa.')).toBeTruthy();
  });
});
