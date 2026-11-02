import { fireEvent, render, screen } from '@testing-library/react-native';

import type { CompanyDashboardStats } from '../../company/dashboardStats';
import { useCompanyDashboard, type UseCompanyDashboardResult } from '../../hooks/useCompanyDashboard';
import { countLabel } from '../../utils/format';
import { CompanyDashboardScreen, dashboardCards } from '../CompanyDashboardScreen';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock('../../hooks/useCompanyDashboard', () => ({ useCompanyDashboard: jest.fn() }));

const stats: CompanyDashboardStats = {
  activeBuses: 3,
  totalBuses: 5,
  routesInService: 1,
  activeRoutes: 2,
  passengersOnBoard: 47,
  activeCapacity: 180,
  pendingComplaints: 4,
};

function mockDashboard(overrides: Partial<UseCompanyDashboardResult> = {}) {
  const value: UseCompanyDashboardResult = { stats, loading: false, error: null, refresh: jest.fn().mockResolvedValue(undefined), ...overrides };
  jest.mocked(useCompanyDashboard).mockReturnValue(value);
  return value;
}

beforeEach(() => jest.clearAllMocks());

describe('dashboardCards', () => {
  it('son las 4 tarjetas del web, en su orden y con sus íconos', () => {
    expect(dashboardCards(stats, false).map(({ icon, label, value }) => `${icon} ${label}: ${value}`)).toEqual([
      '🚍 Micros activas: 3',
      '🗺️ Rutas en servicio: 1',
      '👥 Pasajeros a bordo: 47',
      '📋 Reclamos pendientes: 4',
    ]);
  });

  it('usa singular y plural según la cantidad', () => {
    expect(countLabel(1, 'micro', 'micros')).toBe('1 micro');
    expect(countLabel(0, 'micro', 'micros')).toBe('0 micros');
    const one = dashboardCards({ ...stats, totalBuses: 1, activeRoutes: 1 }, false);
    expect(one[0].detail).toBe('de 1 micro');
    expect(one[1].detail).toBe('de 1 ruta activa');
  });

  it('mientras carga, o si no hay dato de reclamos, muestran "—" como el web', () => {
    expect(dashboardCards(stats, true).every((card) => card.value === '—' && card.detail === null)).toBe(true);
    expect(dashboardCards({ ...stats, pendingComplaints: null }, false)[3].value).toBe('—');
  });
});

describe('CompanyDashboardScreen', () => {
  it('muestra el encabezado del web y las tarjetas con los números reales', async () => {
    mockDashboard();
    await render(<CompanyDashboardScreen />);

    expect(screen.getByRole('header', { name: 'Dashboard' })).toBeTruthy();
    expect(screen.getByText('KPIs y resumen de operaciones de la empresa')).toBeTruthy();
    expect(screen.getByLabelText('Micros activas: 3, de 5 micros')).toBeTruthy();
    expect(screen.getByLabelText('Rutas en servicio: 1, de 2 rutas activas')).toBeTruthy();
    expect(screen.getByLabelText('Pasajeros a bordo: 47, de 180 asientos en ruta')).toBeTruthy();
    expect(screen.getByLabelText('Reclamos pendientes: 4')).toBeTruthy();
  });

  it('los accesos llevan a la flota y a las rutas', async () => {
    mockDashboard();
    await render(<CompanyDashboardScreen />);

    await fireEvent.press(screen.getByRole('button', { name: 'Administrar flota: 5 micros de la empresa' }));
    expect(mockPush).toHaveBeenLastCalledWith('/company/buses');
    await fireEvent.press(screen.getByRole('button', { name: 'Consultar rutas: 2 rutas activas' }));
    expect(mockPush).toHaveBeenLastCalledWith('/company/routes');
  });

  it('si falla muestra el error y "Reintentar" vuelve a pedir los datos', async () => {
    const dashboard = mockDashboard({ error: 'No se pudo cargar la información de la empresa.' });
    await render(<CompanyDashboardScreen />);

    expect(screen.getByText('No se pudo cargar la información de la empresa.')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Reintentar' }));
    expect(dashboard.refresh).toHaveBeenCalled();
  });
});
