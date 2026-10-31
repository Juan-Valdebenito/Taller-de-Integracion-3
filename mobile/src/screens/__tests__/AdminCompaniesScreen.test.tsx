import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react-native';

import * as adminApi from '../../api/adminApi';
import * as companyApi from '../../api/companyApi';
import { ApiError } from '../../api/errors';
import { useAdminCompanies } from '../../hooks/useAdminCompanies';
import { AdminCompaniesScreen } from '../AdminCompaniesScreen';

jest.mock('../../api/adminApi', () => ({ fetchCompanies: jest.fn(), fetchPendingComplaintsByCompany: jest.fn() }));
jest.mock('../../api/companyApi', () => ({ fetchCompanyBuses: jest.fn(), fetchCompanyRoutes: jest.fn() }));

const admin = jest.mocked(adminApi);
const company = jest.mocked(companyApi);

beforeEach(() => {
  jest.clearAllMocks();
  admin.fetchCompanies.mockResolvedValue([
    { id: 'company-demo', name: 'Empresa Demo', isActive: true },
    { id: 'co2', name: 'Buses Ñielol', isActive: true },
  ]);
  admin.fetchPendingComplaintsByCompany.mockResolvedValue({ 'company-demo': 2 });
  company.fetchCompanyBuses.mockResolvedValue([
    { id: 'b1', patente: 'DEMO-01', capacity: 40, currentPassengers: 0, status: 'ACTIVE', companyId: 'company-demo' },
  ]);
  company.fetchCompanyRoutes.mockResolvedValue([{ id: 'r1', code: 'L1', name: 'Centro', isActive: true, companyId: 'company-demo' }]);
});

describe('useAdminCompanies', () => {
  it('si fallan las cifras, igual muestra las empresas (en cero)', async () => {
    company.fetchCompanyBuses.mockRejectedValue(new Error('caído'));
    admin.fetchPendingComplaintsByCompany.mockRejectedValue(new Error('caído'));
    const { result } = await renderHook(() => useAdminCompanies());

    await waitFor(() => expect(result.current.companies).toHaveLength(2));
    expect(result.current.companies[0]).toMatchObject({ buses: 0, routes: 1, pendingComplaints: 0 });
    expect(result.current.error).toBeNull();
  });

  it('si fallan las empresas muestra el error', async () => {
    admin.fetchCompanies.mockRejectedValue(new ApiError(403, 'No tienes permiso para realizar esta acción.'));
    const { result } = await renderHook(() => useAdminCompanies());

    await waitFor(() => expect(result.current.error).toBe('No tienes permiso para realizar esta acción.'));
    await act(async () => {});
  });
});

describe('AdminCompaniesScreen', () => {
  it('muestra el encabezado del web y una tarjeta por empresa con cifras reales', async () => {
    await render(<AdminCompaniesScreen />);

    expect(screen.getByRole('header', { name: 'Empresas de Transporte' })).toBeTruthy();
    expect(await screen.findByText('2 activas de 2 registradas')).toBeTruthy();
    expect(screen.getByLabelText('Empresa Demo, activa: 1 micros, 1 rutas, 2 reclamos pendientes')).toBeTruthy();
    expect(screen.getByLabelText('Buses Ñielol, activa: 0 micros, 0 rutas, 0 reclamos pendientes')).toBeTruthy();
  });

  it('busca por nombre y avisa si no hay resultados', async () => {
    await render(<AdminCompaniesScreen />);
    await screen.findByText('2 activas de 2 registradas');

    await fireEvent.changeText(screen.getByLabelText('Buscar empresa'), 'nielol');
    expect(screen.queryByLabelText(/^Empresa Demo/)).toBeNull();
    expect(screen.getByLabelText(/^Buses Ñielol/)).toBeTruthy();

    await fireEvent.changeText(screen.getByLabelText('Buscar empresa'), 'zzz');
    expect(screen.getByText('No se encontraron empresas')).toBeTruthy();
  });

  it('filtra por estado', async () => {
    await render(<AdminCompaniesScreen />);
    await screen.findByText('2 activas de 2 registradas');

    await fireEvent.press(screen.getByRole('button', { name: 'Estado: Todos los estados' }));
    await fireEvent.press(screen.getByRole('radio', { name: 'Inactivas' }));
    expect(screen.getByText('No se encontraron empresas')).toBeTruthy();
  });
});
