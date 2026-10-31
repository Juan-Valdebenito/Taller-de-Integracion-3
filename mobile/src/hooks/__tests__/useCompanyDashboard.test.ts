import { act, renderHook, waitFor } from '@testing-library/react-native';

import * as companyApi from '../../api/companyApi';
import type { CompanyBus, CompanyRoute } from '../../api/companyApi';
import { useAuth } from '../../auth/AuthContext';
import type { AuthUser } from '../../auth/types';
import { mockAuthValue } from '../../test-utils/auth';
import { useCompanyDashboard } from '../useCompanyDashboard';

jest.mock('../../auth/AuthContext', () => ({ useAuth: jest.fn() }));
jest.mock('../../api/companyApi', () => ({
  fetchCompanyBuses: jest.fn(),
  fetchCompanyRoutes: jest.fn(),
  fetchCompanyComplaintStats: jest.fn(),
}));

const api = jest.mocked(companyApi);
const company: AuthUser = { id: 'u1', name: 'Buses Sur', email: 'empresa@sur.cl', role: 'COMPANY', companyId: 'co1' };
const buses: CompanyBus[] = [
  { id: 'a', patente: 'AAAA11', capacity: 80, currentPassengers: 30, status: 'ACTIVE', companyId: 'co1', routeId: 'r1' },
  { id: 'b', patente: 'BBBB22', capacity: 80, currentPassengers: 0, status: 'INACTIVE', companyId: 'co1', routeId: null },
  { id: 'x', patente: 'OTRA99', capacity: 80, currentPassengers: 70, status: 'ACTIVE', companyId: 'otra', routeId: 'r9' },
];
const routes: CompanyRoute[] = [
  { id: 'r1', name: 'Centro', code: '7A', isActive: true, companyId: 'co1' },
  { id: 'r9', name: 'Otra', code: '9Z', isActive: true, companyId: 'otra' },
];

function signIn(user: AuthUser = company) {
  jest.mocked(useAuth).mockReturnValue(mockAuthValue({ status: 'signedIn', user }));
}

beforeEach(() => {
  jest.clearAllMocks();
  signIn();
  api.fetchCompanyBuses.mockResolvedValue(buses);
  api.fetchCompanyRoutes.mockResolvedValue(routes);
  api.fetchCompanyComplaintStats.mockResolvedValue({ total: 9, pending: 3, inReview: 2, resolved: 4, rejected: 0 });
});

describe('useCompanyDashboard', () => {
  it('junta micros, rutas y reclamos pendientes solo de la empresa del usuario', async () => {
    const { result } = await renderHook(() => useCompanyDashboard());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(api.fetchCompanyComplaintStats).toHaveBeenCalledWith('co1');
    expect(result.current.stats).toEqual({
      activeBuses: 1,
      totalBuses: 2,
      routesInService: 1,
      activeRoutes: 1,
      passengersOnBoard: 30,
      activeCapacity: 80,
      pendingComplaints: 3,
    });
    expect(result.current.error).toBeNull();
  });

  it('si fallan los reclamos, el resto del dashboard se muestra igual (pendientes = null)', async () => {
    api.fetchCompanyComplaintStats.mockRejectedValue(new Error('caído'));
    const { result } = await renderHook(() => useCompanyDashboard());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.stats.pendingComplaints).toBeNull();
    expect(result.current.stats.activeBuses).toBe(1);
    expect(result.current.error).toBeNull();
  });

  it('una cuenta de empresa sin empresa asociada no consulta reclamos y muestra el aviso', async () => {
    signIn({ ...company, companyId: null });
    const { result } = await renderHook(() => useCompanyDashboard());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(api.fetchCompanyComplaintStats).not.toHaveBeenCalled();
    expect(result.current.stats.pendingComplaints).toBeNull();
    expect(result.current.error).toBe('La cuenta no está asociada a una empresa. Contacta a un administrador.');
  });

  it('refresh vuelve a pedir todo', async () => {
    const { result } = await renderHook(() => useCompanyDashboard());
    await waitFor(() => expect(result.current.loading).toBe(false));

    api.fetchCompanyComplaintStats.mockResolvedValue({ total: 10, pending: 5, inReview: 1, resolved: 4, rejected: 0 });
    await act(() => result.current.refresh());

    expect(api.fetchCompanyBuses).toHaveBeenCalledTimes(2);
    expect(api.fetchCompanyComplaintStats).toHaveBeenCalledTimes(2);
    expect(result.current.stats.pendingComplaints).toBe(5);
  });
});
