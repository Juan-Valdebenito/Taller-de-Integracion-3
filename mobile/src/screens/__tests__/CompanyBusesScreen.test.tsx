import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import * as companyApi from '../../api/companyApi';
import type { CompanyBus, CompanyRoute } from '../../api/companyApi';
import { useAuth } from '../../auth/AuthContext';
import { useCompanyOperations } from '../../hooks/useCompanyOperations';
import { mockAuthValue } from '../../test-utils/auth';
import { ApiError } from '../../api/errors';
import { CompanyBusesScreen } from '../CompanyBusesScreen';

jest.mock('../../hooks/useCompanyOperations', () => ({ useCompanyOperations: jest.fn() }));
jest.mock('../../auth/AuthContext', () => ({ useAuth: jest.fn() }));
jest.mock('../../api/companyApi', () => ({ createCompanyBus: jest.fn(), saveCompanyBus: jest.fn(), updateCompanyBus: jest.fn(), deleteCompanyBus: jest.fn() }));

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

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(useAuth).mockReturnValue(
    mockAuthValue({ status: 'signedIn', user: { id: 'u1', name: 'Empresa', email: 'e@x.cl', role: 'COMPANY', companyId: 'co1' } }),
  );
});

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

  it('"Nueva Micro" abre el formulario vacío y "Editar" lo abre con la micro', async () => {
    mockOperations();
    await render(<CompanyBusesScreen />);

    await fireEvent.press(screen.getByRole('button', { name: 'Nueva Micro' }));
    expect(screen.getByRole('header', { name: '➕ Registrar Nueva Micro' })).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Cancelar' }));

    await fireEvent.press(screen.getByRole('button', { name: 'Editar micro FGRT-33' }));
    expect(screen.getByRole('header', { name: '✏️ Editar Micro FGRT-33' })).toBeTruthy();
  });

  it('al guardar muestra el aviso del web por 3 s y vuelve a pedir la flota', async () => {
    jest.useFakeTimers();
    try {
      const operations = mockOperations();
      jest.mocked(companyApi.saveCompanyBus).mockResolvedValue(buses[0]);
      await render(<CompanyBusesScreen />);

      await fireEvent.press(screen.getByRole('button', { name: 'Editar micro BGPK-45' }));
      await fireEvent.press(screen.getByRole('button', { name: 'Guardar Cambios' }));

      expect(await screen.findByText('Micro BGPK-45 actualizada exitosamente')).toBeTruthy();
      expect(operations.refresh).toHaveBeenCalled();
      expect(screen.queryByRole('header', { name: /Editar Micro/ })).toBeNull();

      await act(async () => jest.advanceTimersByTime(3000));
      expect(screen.queryByText('Micro BGPK-45 actualizada exitosamente')).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });

  it('pide confirmación y elimina una micro solo cuando el backend responde correctamente', async () => {
    const operations = mockOperations();
    jest.mocked(companyApi.deleteCompanyBus).mockResolvedValue(undefined);
    await render(<CompanyBusesScreen />);

    await fireEvent.press(screen.getByRole('button', { name: 'Dar de baja micro BGPK-45' }));
    expect(screen.getByRole('header', { name: 'Dar de baja la micro' })).toBeTruthy();
    expect(screen.getByText('¿Dar de baja la micro BGPK-45?')).toBeTruthy();

    await fireEvent.press(screen.getByRole('button', { name: 'Dar de baja' }));
    await waitFor(() => expect(companyApi.deleteCompanyBus).toHaveBeenCalledWith('b1'));
    expect(operations.refresh).toHaveBeenCalled();
    expect(await screen.findByText('Micro BGPK-45 eliminada exitosamente')).toBeTruthy();
  });

  it('mantiene la micro visible y muestra el error si el backend no la puede eliminar', async () => {
    const operations = mockOperations();
    jest.mocked(companyApi.deleteCompanyBus).mockRejectedValue(new ApiError(500, 'No se pudo eliminar la micro.'));
    await render(<CompanyBusesScreen />);

    await fireEvent.press(screen.getByRole('button', { name: 'Dar de baja micro BGPK-45' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Dar de baja' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo eliminar la micro.');
    expect(screen.getByLabelText(/Micro BGPK-45/)).toBeTruthy();
    expect(operations.refresh).not.toHaveBeenCalled();
    expect(screen.queryByText('Micro BGPK-45 eliminada exitosamente')).toBeNull();
  });
});
